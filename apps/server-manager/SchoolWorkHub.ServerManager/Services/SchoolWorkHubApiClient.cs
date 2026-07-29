using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using SchoolWorkHub.ServerManager.Models;

namespace SchoolWorkHub.ServerManager.Services;

public sealed class ApiRequestException(string message) : Exception(message);

public sealed class SchoolWorkHubApiClient : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _httpClient;

    public SchoolWorkHubApiClient(string baseUrl)
    {
        if (!Uri.TryCreate(baseUrl.TrimEnd('/') + "/", UriKind.Absolute, out var baseUri))
        {
            throw new ArgumentException("올바른 서버 주소를 입력하세요.", nameof(baseUrl));
        }

        _httpClient = new HttpClient
        {
            BaseAddress = baseUri,
            Timeout = TimeSpan.FromSeconds(15),
        };
    }

    public async Task<(HealthResponse Live, HealthResponse Ready)> CheckHealthAsync(
        CancellationToken cancellationToken = default)
    {
        var live = await GetAsync<HealthResponse>("health/live", cancellationToken);
        var ready = await GetAsync<HealthResponse>("health/ready", cancellationToken);
        return (live, ready);
    }

    public async Task<BootstrapResponse> BootstrapAsync(
        BootstrapRequest request,
        CancellationToken cancellationToken = default)
    {
        using var response = await _httpClient.PostAsJsonAsync(
            "api/v1/setup/bootstrap",
            request,
            JsonOptions,
            cancellationToken);
        return await ReadResponseAsync<BootstrapResponse>(response, cancellationToken);
    }

    private async Task<T> GetAsync<T>(string path, CancellationToken cancellationToken)
    {
        using var response = await _httpClient.GetAsync(path, cancellationToken);
        return await ReadResponseAsync<T>(response, cancellationToken);
    }

    private static async Task<T> ReadResponseAsync<T>(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new ApiRequestException(
                $"서버 요청 실패: {(int)response.StatusCode} {response.ReasonPhrase}\n{body}");
        }

        var value = await response.Content.ReadFromJsonAsync<T>(JsonOptions, cancellationToken);
        return value ?? throw new ApiRequestException("서버 응답을 해석하지 못했습니다.");
    }

    public void Dispose() => _httpClient.Dispose();
}
