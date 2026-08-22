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

public sealed record LoginRequest(
    [property: JsonPropertyName("school_code")] string SchoolCode,
    [property: JsonPropertyName("username")] string Username,
    [property: JsonPropertyName("password")] string Password);

public sealed record TokenResponse(
    [property: JsonPropertyName("access_token")] string AccessToken,
    [property: JsonPropertyName("token_type")] string TokenType,
    [property: JsonPropertyName("expires_in_seconds")] int ExpiresInSeconds);

public sealed record DepartmentResponse(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("school_id")] Guid SchoolId,
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("name")] string Name);

public sealed record RoleResponse(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("school_id")] Guid SchoolId,
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("is_system")] bool IsSystem,
    [property: JsonPropertyName("permission_codes")] IReadOnlyList<string> PermissionCodes);

public sealed record UserResponse(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("school_id")] Guid SchoolId,
    [property: JsonPropertyName("department_id")] Guid? DepartmentId,
    [property: JsonPropertyName("username")] string Username,
    [property: JsonPropertyName("display_name")] string DisplayName,
    [property: JsonPropertyName("is_active")] bool IsActive,
    [property: JsonPropertyName("is_superuser")] bool IsSuperuser,
    [property: JsonPropertyName("role_ids")] IReadOnlyList<Guid> RoleIds);
