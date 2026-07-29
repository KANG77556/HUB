using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Input;
using SchoolWorkHub.ServerManager.Infrastructure;
using SchoolWorkHub.ServerManager.Models;
using SchoolWorkHub.ServerManager.Services;

namespace SchoolWorkHub.ServerManager.ViewModels;

public sealed class MainWindowViewModel : INotifyPropertyChanged
{
    private string _apiBaseUrl = "http://127.0.0.1:8000";
    private string _schoolCode = string.Empty;
    private string _schoolName = string.Empty;
    private string _adminUsername = "admin";
    private string _adminDisplayName = "최고관리자";
    private string _adminPassword = string.Empty;
    private string _statusMessage = "서버 주소를 확인한 뒤 초기 설정을 진행하세요.";
    private string _liveStatus = "확인 전";
    private string _readyStatus = "확인 전";
    private bool _isBusy;

    public MainWindowViewModel()
    {
        CheckConnectionCommand = new AsyncRelayCommand(CheckConnectionAsync);
        BootstrapCommand = new AsyncRelayCommand(BootstrapAsync);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public ICommand CheckConnectionCommand { get; }
    public ICommand BootstrapCommand { get; }

    public string ApiBaseUrl
    {
        get => _apiBaseUrl;
        set => SetField(ref _apiBaseUrl, value);
    }

    public string SchoolCode
    {
        get => _schoolCode;
        set => SetField(ref _schoolCode, value);
    }

    public string SchoolName
    {
        get => _schoolName;
        set => SetField(ref _schoolName, value);
    }

    public string AdminUsername
    {
        get => _adminUsername;
        set => SetField(ref _adminUsername, value);
    }

    public string AdminDisplayName
    {
        get => _adminDisplayName;
        set => SetField(ref _adminDisplayName, value);
    }

    public string StatusMessage
    {
        get => _statusMessage;
        private set => SetField(ref _statusMessage, value);
    }

    public string LiveStatus
    {
        get => _liveStatus;
        private set => SetField(ref _liveStatus, value);
    }

    public string ReadyStatus
    {
        get => _readyStatus;
        private set => SetField(ref _readyStatus, value);
    }

    public bool IsBusy
    {
        get => _isBusy;
        private set => SetField(ref _isBusy, value);
    }

    public void SetAdminPassword(string password) => _adminPassword = password;

    private async Task CheckConnectionAsync()
    {
        await RunBusyAsync(async () =>
        {
            using var client = new SchoolWorkHubApiClient(ApiBaseUrl);
            var health = await client.CheckHealthAsync();
            LiveStatus = $"{health.Live.Status} · API {health.Live.Version}";
            ReadyStatus = health.Ready.Status;
            StatusMessage = "서버와 데이터베이스가 정상적으로 응답했습니다.";
        });
    }

    private async Task BootstrapAsync()
    {
        if (string.IsNullOrWhiteSpace(SchoolCode)
            || string.IsNullOrWhiteSpace(SchoolName)
            || string.IsNullOrWhiteSpace(AdminUsername)
            || string.IsNullOrWhiteSpace(AdminDisplayName))
        {
            StatusMessage = "학교와 관리자 정보를 모두 입력하세요.";
            return;
        }

        if (_adminPassword.Length < 12)
        {
            StatusMessage = "관리자 비밀번호는 12자 이상이어야 합니다.";
            return;
        }

        await RunBusyAsync(async () =>
        {
            using var client = new SchoolWorkHubApiClient(ApiBaseUrl);
            var response = await client.BootstrapAsync(
                new BootstrapRequest(
                    SchoolCode.Trim(),
                    SchoolName.Trim(),
                    AdminUsername.Trim(),
                    AdminDisplayName.Trim(),
                    _adminPassword));
            StatusMessage =
                $"초기 설정 완료 · 학교 {response.SchoolId} · 관리자 {response.AdminUserId}";
            await CheckConnectionAsync();
        });
    }

    private async Task RunBusyAsync(Func<Task> action)
    {
        if (IsBusy)
        {
            return;
        }

        IsBusy = true;
        try
        {
            await action();
        }
        catch (ApiRequestException exception)
        {
            StatusMessage = exception.Message;
        }
        catch (HttpRequestException exception)
        {
            StatusMessage = $"서버 연결 실패: {exception.Message}";
        }
        catch (TaskCanceledException)
        {
            StatusMessage = "서버 응답 시간이 초과되었습니다.";
        }
        catch (ArgumentException exception)
        {
            StatusMessage = exception.Message;
        }
        finally
        {
            IsBusy = false;
        }
    }

    private void SetField<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
        {
            return;
        }

        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}
