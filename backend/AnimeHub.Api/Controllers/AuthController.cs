using System.Security.Claims;
using AnimeHub.Api.Models;
using AnimeHub.Api.Services;
using AnimeHub.Infrastructure.Auth;
using AnimeHub.Infrastructure.Data;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AnimeHub.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _users;
    private readonly SignInManager<ApplicationUser> _signIn;
    private readonly AppDbContext _db;
    private readonly IAccountEmailSender _emailSender;
    private readonly IOptions<IdentityOptions> _identityOptions;
    private readonly IHostEnvironment _environment;

    public AuthController(
        UserManager<ApplicationUser> users,
        SignInManager<ApplicationUser> signIn,
        AppDbContext db,
        IAccountEmailSender emailSender,
        IOptions<IdentityOptions> identityOptions,
        IHostEnvironment environment)
    {
        _users = users;
        _signIn = signIn;
        _db = db;
        _emailSender = emailSender;
        _identityOptions = identityOptions;
        _environment = environment;
    }

    [HttpGet("csrf")]
    public ActionResult<CsrfResponse> Csrf([FromServices] IAntiforgery antiforgery)
    {
        var tokens = antiforgery.GetAndStoreTokens(HttpContext);
        return Ok(new CsrfResponse { Token = tokens.RequestToken ?? "" });
    }

    [HttpPost("register")]
    public async Task<ActionResult> Register([FromBody] RegisterRequest req, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(ApiError.Validation("Email and password are required."));

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = req.Email.Trim().ToLowerInvariant(),
            Email = req.Email.Trim().ToLowerInvariant(),
            DisplayName = string.IsNullOrWhiteSpace(req.DisplayName) ? req.Email.Split('@')[0] : req.DisplayName.Trim(),
            IsProfilePublic = true,
            LockoutEnabled = true
        };

        var result = await _users.CreateAsync(user, req.Password);
        if (!result.Succeeded)
            return BadRequest(ApiError.Validation("Registration failed.", ToIdentityErrors(result)));

        var confirmationToken = await _users.GenerateEmailConfirmationTokenAsync(user);
        await _emailSender.SendEmailConfirmationAsync(user, confirmationToken, Request, cancellationToken);

        if (_identityOptions.Value.SignIn.RequireConfirmedEmail)
        {
            return Ok(new AuthWorkflowResponse
            {
                UserId = user.Id,
                Email = user.Email ?? "",
                RequiresEmailConfirmation = true,
                DevelopmentToken = DevelopmentToken(confirmationToken)
            });
        }

        await _signIn.SignInAsync(user, isPersistent: true);
        return Ok(await ToMeDto(user));
    }

    [HttpPost("login")]
    public async Task<ActionResult> Login([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(ApiError.Validation("Email and password are required."));

        var user = await _users.FindByEmailAsync(req.Email.Trim().ToLowerInvariant());
        if (user == null) return Unauthorized(ApiError.Unauthorized("Invalid credentials."));

        var result = await _signIn.CheckPasswordSignInAsync(user, req.Password, lockoutOnFailure: true);
        if (result.IsLockedOut) return AccountLocked(user);
        if (result.IsNotAllowed)
            return StatusCode(StatusCodes.Status403Forbidden, ApiError.Unauthorized("Email confirmation is required."));
        if (!result.Succeeded) return Unauthorized(ApiError.Unauthorized("Invalid credentials."));

        await _signIn.SignInAsync(user, isPersistent: true);
        return Ok(await ToMeDto(user));
    }

    [HttpGet("confirm-email")]
    public async Task<ActionResult> ConfirmEmailLink([FromQuery] Guid userId, [FromQuery] string token)
    {
        var result = await ConfirmEmailInternal(userId, token);
        return result.Succeeded
            ? Ok(new { confirmed = true })
            : BadRequest(ApiError.Validation("Email confirmation failed.", ToIdentityErrors(result)));
    }

    [HttpPost("confirm-email")]
    public async Task<ActionResult> ConfirmEmail([FromBody] ConfirmEmailRequest req)
    {
        var result = await ConfirmEmailInternal(req.UserId, req.Token);
        if (!result.Succeeded)
            return BadRequest(ApiError.Validation("Email confirmation failed.", ToIdentityErrors(result)));

        var user = await _users.FindByIdAsync(req.UserId.ToString());
        if (user != null)
        {
            await _signIn.SignInAsync(user, isPersistent: true);
            return Ok(await ToMeDto(user));
        }

        return Ok(new { confirmed = true });
    }

    [HttpPost("resend-confirmation")]
    public async Task<ActionResult<AuthWorkflowResponse>> ResendConfirmation(
        [FromBody] ResendEmailConfirmationRequest req,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(ApiError.Validation("Email is required."));

        var user = await _users.FindByEmailAsync(req.Email.Trim().ToLowerInvariant());
        if (user == null || await _users.IsEmailConfirmedAsync(user))
            return Ok(new AuthWorkflowResponse { Email = req.Email.Trim(), RequiresEmailConfirmation = true });

        var token = await _users.GenerateEmailConfirmationTokenAsync(user);
        await _emailSender.SendEmailConfirmationAsync(user, token, Request, cancellationToken);

        return Ok(new AuthWorkflowResponse
        {
            UserId = user.Id,
            Email = user.Email ?? "",
            RequiresEmailConfirmation = true,
            DevelopmentToken = DevelopmentToken(token)
        });
    }

    [HttpPost("forgot-password")]
    public async Task<ActionResult<AuthWorkflowResponse>> ForgotPassword(
        [FromBody] ForgotPasswordRequest req,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(ApiError.Validation("Email is required."));

        var email = req.Email.Trim().ToLowerInvariant();
        var user = await _users.FindByEmailAsync(email);
        if (user == null || !await _users.IsEmailConfirmedAsync(user))
            return Ok(new AuthWorkflowResponse { Email = email, ResetEmailSent = true });

        var token = await _users.GeneratePasswordResetTokenAsync(user);
        await _emailSender.SendPasswordResetAsync(user, token, Request, cancellationToken);

        return Ok(new AuthWorkflowResponse
        {
            UserId = user.Id,
            Email = user.Email ?? email,
            ResetEmailSent = true,
            DevelopmentToken = DevelopmentToken(token)
        });
    }

    [HttpPost("reset-password")]
    public async Task<ActionResult> ResetPassword([FromBody] ResetPasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) ||
            string.IsNullOrWhiteSpace(req.Token) ||
            string.IsNullOrWhiteSpace(req.NewPassword))
        {
            return BadRequest(ApiError.Validation("Email, token, and new password are required."));
        }

        var user = await _users.FindByEmailAsync(req.Email.Trim().ToLowerInvariant());
        if (user == null)
            return BadRequest(ApiError.Validation("Password reset failed."));

        var result = await _users.ResetPasswordAsync(user, req.Token, req.NewPassword);
        if (!result.Succeeded)
            return BadRequest(ApiError.Validation("Password reset failed.", ToIdentityErrors(result)));

        return Ok(new { reset = true });
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<ActionResult> ChangePassword([FromBody] ChangePasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.CurrentPassword) || string.IsNullOrWhiteSpace(req.NewPassword))
            return BadRequest(ApiError.Validation("Current password and new password are required."));

        var user = await CurrentUser();
        if (user == null) return Unauthorized(ApiError.Unauthorized("Not authenticated."));

        var result = await _users.ChangePasswordAsync(user, req.CurrentPassword, req.NewPassword);
        if (!result.Succeeded)
            return BadRequest(ApiError.Validation("Password change failed.", ToIdentityErrors(result)));

        await _signIn.RefreshSignInAsync(user);
        return Ok(new { changed = true });
    }

    [HttpPost("logout")]
    public async Task<ActionResult> Logout()
    {
        await _signIn.SignOutAsync();
        return Ok();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult> Me()
    {
        var user = await CurrentUser();
        if (user == null) return Unauthorized(ApiError.Unauthorized("Not authenticated."));

        return Ok(await ToMeDto(user));
    }

    [Authorize]
    [HttpPatch("me")]
    public async Task<ActionResult> UpdateMe([FromBody] UpdateProfileRequest req)
    {
        var user = await CurrentUser();
        if (user == null) return Unauthorized(ApiError.Unauthorized("Not authenticated."));

        var displayName = req.DisplayName?.Trim();
        if (!string.IsNullOrWhiteSpace(displayName))
        {
            if (displayName.Length > 80)
                return BadRequest(ApiError.Validation("Display name too long (max 80)."));

            user.DisplayName = displayName;
        }

        var avatarUrl = req.AvatarUrl?.Trim();
        if (string.IsNullOrWhiteSpace(avatarUrl))
        {
            user.AvatarUrl = null;
        }
        else
        {
            if (avatarUrl.Length > 1000)
                return BadRequest(ApiError.Validation("Avatar URL too long (max 1000)."));
            if (!IsSafeHttpUrl(avatarUrl))
                return BadRequest(ApiError.Validation("Avatar URL must be an http or https URL."));

            user.AvatarUrl = avatarUrl;
        }

        if (req.IsProfilePublic.HasValue)
            user.IsProfilePublic = req.IsProfilePublic.Value;

        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
            return BadRequest(ApiError.Validation("Profile update failed.", ToIdentityErrors(result)));

        await _signIn.RefreshSignInAsync(user);
        return Ok(await ToMeDto(user));
    }

    [Authorize]
    [HttpDelete("me")]
    public async Task<ActionResult> DeleteMe([FromBody] DeleteAccountRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(ApiError.Validation("Password is required."));

        var user = await CurrentUser();
        if (user == null) return Unauthorized(ApiError.Unauthorized("Not authenticated."));

        if (!await _users.CheckPasswordAsync(user, req.Password))
            return Unauthorized(ApiError.Unauthorized("Invalid password."));

        await using var transaction = await _db.Database.BeginTransactionAsync();
        await DeleteUserContent(user.Id);

        var result = await _users.DeleteAsync(user);
        if (!result.Succeeded)
            return BadRequest(ApiError.Validation("Account deletion failed.", ToIdentityErrors(result)));

        await transaction.CommitAsync();
        await _signIn.SignOutAsync();

        return NoContent();
    }

    private async Task<ApplicationUser?> CurrentUser()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return string.IsNullOrWhiteSpace(id) ? null : await _users.FindByIdAsync(id);
    }

    private async Task<object> ToMeDto(ApplicationUser user)
    {
        var roles = await _users.GetRolesAsync(user);
        return new
        {
            user.Id,
            user.Email,
            user.EmailConfirmed,
            user.DisplayName,
            user.AvatarUrl,
            user.IsProfilePublic,
            Roles = roles,
            CanModerate = roles.Any(role =>
                string.Equals(role, "Moderator", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase))
        };
    }

    private static bool IsSafeHttpUrl(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);

    private async Task<IdentityResult> ConfirmEmailInternal(Guid userId, string token)
    {
        if (userId == Guid.Empty || string.IsNullOrWhiteSpace(token))
            return IdentityResult.Failed(new IdentityError { Code = "InvalidToken", Description = "Invalid confirmation token." });

        var user = await _users.FindByIdAsync(userId.ToString());
        return user == null
            ? IdentityResult.Failed(new IdentityError { Code = "InvalidToken", Description = "Invalid confirmation token." })
            : await _users.ConfirmEmailAsync(user, token);
    }

    private ObjectResult AccountLocked(ApplicationUser user)
    {
        var retryAfter = user.LockoutEnd.HasValue
            ? Math.Max(1, (int)Math.Ceiling((user.LockoutEnd.Value - DateTimeOffset.UtcNow).TotalSeconds))
            : 60;

        Response.Headers["Retry-After"] = retryAfter.ToString();
        return StatusCode(423, new ApiError("account_locked", "Too many failed login attempts. Try again later."));
    }

    private async Task DeleteUserContent(Guid userId)
    {
        var now = DateTime.UtcNow;

        await _db.TrackedShows
            .Where(show => show.UserId == userId)
            .ExecuteDeleteAsync();

        await _db.DiscussionReactions
            .Where(reaction => reaction.UserId == userId)
            .ExecuteDeleteAsync();

        await _db.DiscussionReports
            .Where(report => report.ReporterUserId == userId)
            .ExecuteDeleteAsync();

        await _db.DiscussionComments
            .Where(comment => comment.UserId == userId && !comment.IsDeleted)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(comment => comment.IsDeleted, true)
                .SetProperty(comment => comment.Body, "")
                .SetProperty(comment => comment.UpdatedUtc, now)
                .SetProperty(comment => comment.DeletedUtc, now));

        await _db.DiscussionThreads
            .Where(thread => thread.UserId == userId && !thread.IsDeleted)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(thread => thread.IsDeleted, true)
                .SetProperty(thread => thread.Title, "[deleted]")
                .SetProperty(thread => thread.Body, "")
                .SetProperty(thread => thread.UpdatedUtc, now)
                .SetProperty(thread => thread.DeletedUtc, now));
    }

    private string? DevelopmentToken(string token) => _environment.IsDevelopment() ? token : null;

    private static Dictionary<string, string[]> ToIdentityErrors(IdentityResult result) =>
        result.Errors
            .GroupBy(error => error.Code)
            .ToDictionary(group => group.Key, group => group.Select(error => error.Description).ToArray());

    public sealed class CsrfResponse
    {
        public string Token { get; set; } = "";
    }

    public sealed class AuthWorkflowResponse
    {
        public Guid? UserId { get; set; }
        public string Email { get; set; } = "";
        public bool RequiresEmailConfirmation { get; set; }
        public bool ResetEmailSent { get; set; }
        public string? DevelopmentToken { get; set; }
    }

    public sealed class RegisterRequest
    {
        public string Email { get; set; } = "";
        public string Password { get; set; } = "";
        public string? DisplayName { get; set; }
    }

    public sealed class LoginRequest
    {
        public string Email { get; set; } = "";
        public string Password { get; set; } = "";
    }

    public sealed class ConfirmEmailRequest
    {
        public Guid UserId { get; set; }
        public string Token { get; set; } = "";
    }

    public sealed class ResendEmailConfirmationRequest
    {
        public string Email { get; set; } = "";
    }

    public sealed class ForgotPasswordRequest
    {
        public string Email { get; set; } = "";
    }

    public sealed class ResetPasswordRequest
    {
        public string Email { get; set; } = "";
        public string Token { get; set; } = "";
        public string NewPassword { get; set; } = "";
    }

    public sealed class ChangePasswordRequest
    {
        public string CurrentPassword { get; set; } = "";
        public string NewPassword { get; set; } = "";
    }

    public sealed class UpdateProfileRequest
    {
        public string? DisplayName { get; set; }
        public string? AvatarUrl { get; set; }
        public bool? IsProfilePublic { get; set; }
    }

    public sealed class DeleteAccountRequest
    {
        public string Password { get; set; } = "";
    }
}
