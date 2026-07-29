using System.Text.Json.Serialization;

namespace SchoolWorkHub.ServerManager.Models;

public sealed record HealthResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("service")] string Service,
    [property: JsonPropertyName("version")] string Version);

public sealed record BootstrapRequest(
    [property: JsonPropertyName("school_code")] string SchoolCode,
    [property: JsonPropertyName("school_name")] string SchoolName,
    [property: JsonPropertyName("admin_username")] string AdminUsername,
    [property: JsonPropertyName("admin_display_name")] string AdminDisplayName,
    [property: JsonPropertyName("admin_password")] string AdminPassword);

public sealed record BootstrapResponse(
    [property: JsonPropertyName("school_id")] Guid SchoolId,
    [property: JsonPropertyName("admin_user_id")] Guid AdminUserId,
    [property: JsonPropertyName("status")] string Status);
