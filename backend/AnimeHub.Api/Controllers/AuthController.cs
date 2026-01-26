using AnimeHub.Infrastructure.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace AnimeHub.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _users;
    private readonly SignInManager<ApplicationUser> _signIn;

    public AuthController(UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn)
    {
        _users = users;
        _signIn = signIn;
    }

    [HttpPost("register")]
    public async Task<ActionResult> Register([FromBody] RegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest("Email and password are required.");

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = req.Email.Trim().ToLowerInvariant(),
            Email = req.Email.Trim().ToLowerInvariant(),
            DisplayName = string.IsNullOrWhiteSpace(req.DisplayName) ? req.Email.Split('@')[0] : req.DisplayName.Trim()
        };

        var result = await _users.CreateAsync(user, req.Password);
        if (!result.Succeeded)
            return BadRequest(result.Errors.Select(e => e.Description));

        await _signIn.SignInAsync(user, isPersistent: true);
        return Ok(new { user.Id, user.Email, user.DisplayName });
    }

    [HttpPost("login")]
    public async Task<ActionResult> Login([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest("Email and password are required.");

        var user = await _users.FindByEmailAsync(req.Email.Trim().ToLowerInvariant());
        if (user == null) return Unauthorized("Invalid credentials.");

        var result = await _signIn.CheckPasswordSignInAsync(user, req.Password, lockoutOnFailure: false);
        if (!result.Succeeded) return Unauthorized("Invalid credentials.");

        await _signIn.SignInAsync(user, isPersistent: true);
        return Ok(new { user.Id, user.Email, user.DisplayName });
    }

    [HttpPost("logout")]
    public async Task<ActionResult> Logout()
    {
        await _signIn.SignOutAsync();
        return Ok();
    }

    [Authorize]
    [HttpGet("me")]
    public ActionResult Me()
    {
        return Ok(new
        {
            id = User.FindFirst("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier")?.Value,
            email = User.Identity?.Name
        });
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
}
