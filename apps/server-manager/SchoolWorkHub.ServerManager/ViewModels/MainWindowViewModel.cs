using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Net.Http;
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
    private string _loginSchoolCode = string.Empty;
    private string _loginUsername = "admin";
    private string _loginPassword = string.Empty;
    private string? _accessToken;
    private string _statusMessage = "서버 주소를 확인한 뒤 초기 설정을 진행하세요.";
    private string _liveStatus = "확인 전";
    private string _readyStatus = "확인 전";
    private bool _isBusy;
    private bool _isAuthenticated;

    public MainWindowViewModel()
    {
        CheckConnectionCommand = new AsyncRelayCommand(CheckConnectionAsync);
        BootstrapCommand = new AsyncRelayCommand(BootstrapAsync);
        LoginCommand = new AsyncRelayCommand(LoginAsync);
        RefreshAdministrationCommand = new AsyncRelayCommand(RefreshAdministrationAsync);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public ICommand CheckConnectionCommand { get; }
    public ICommand BootstrapCommand { get; }
    public ICommand LoginCommand { get; }
    public ICommand RefreshAdministrationCommand { get; }

    public ObservableCollection<DepartmentResponse> Departments { get; } = [];
    public ObservableCollection<RoleResponse> Roles { get; } = [];
    public ObservableCollection<UserResponse> Users { get; } = [];

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

    public string LoginSchoolCode
    {
        get => _loginSchoolCode;
        set => SetField(ref _loginSchoolCode, value);
    }

    public string LoginUsername
    {
        get => _loginUsername;
        set => SetField(ref _loginUsername, value);
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

    public bool IsAuthenticated
    {
        get => _isAuthenticated;
        private set => SetField(ref _isAuthenticated, value);
    }

    public void SetAdminPassword(string password) => _adminPassword = password;
    public void SetLoginPassword(string password) => _loginPassword = password;

    private async Task CheckConnectionAsync()
    {
        await RunBusyAsync(async () =>
        {
            using var client = new SchoolWorkHubApiClient(ApiBaseUrl);
            await UpdateHealthAsync(client);
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
            await UpdateHealthAsync(client);
            LoginSchoolCode = SchoolCode.Trim();
            LoginUsername = AdminUsername.Trim();
            StatusMessage =
                $"초기 설정 완료 · 학교 {response.SchoolId} · 관리자 {response.AdminUserId}";
        });
    }

    private async Task LoginAsync()
    {
        if (string.IsNullOrWhiteSpace(LoginSchoolCode)
            || string.IsNullOrWhiteSpace(LoginUsername)
            || string.IsNullOrEmpty(_loginPassword))
        {
            StatusMessage = "로그인 정보를 모두 입력하세요.";
            return;
        }

        await RunBusyAsync(async () =>
        {
            using var publicClient = new SchoolWorkHubApiClient(ApiBaseUrl);
            var token = await publicClient.LoginAsync(
                new LoginRequest(LoginSchoolCode.Trim(), LoginUsername.Trim(), _loginPassword));
            _accessToken = token.AccessToken;
            IsAuthenticated = true;
            await LoadAdministrationCoreAsync();
            StatusMessage = $"관리자로 로그인했습니다. 세션 유효시간 {token.ExpiresInSeconds / 60}분";
        });
    }

    private async Task RefreshAdministrationAsync()
    {
        await RunBusyAsync(async () =>
        {
            await LoadAdministrationCoreAsync();
            StatusMessage = "부서, 역할, 사용자 목록을 새로고침했습니다.";
        });
    }

    private async Task LoadAdministrationCoreAsync()
    {
        if (string.IsNullOrWhiteSpace(_accessToken))
        {
            throw new ApiRequestException("관리자 로그인이 필요합니다.");
        }

        using var client = new SchoolWorkHubApiClient(ApiBaseUrl, _accessToken);
        var departments = await client.GetDepartmentsAsync();
        var roles = await client.GetRolesAsync();
        var users = await client.GetUsersAsync();
        ReplaceItems(Departments, departments);
        ReplaceItems(Roles, roles);
        ReplaceItems(Users, users);
    }

    private async Task UpdateHealthAsync(SchoolWorkHubApiClient client)
    {
        var health = await client.CheckHealthAsync();
        LiveStatus = $"{health.Live.Status} · API {health.Live.Version}";
        ReadyStatus = health.Ready.Status;
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

    private static void ReplaceItems<T>(ObservableCollection<T> target, IEnumerable<T> source)
    {
        target.Clear();
        foreach (var item in source)
        {
            target.Add(item);
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
