using System.Net;
using System.Net.Mail;
using AnimeHub.Infrastructure.Auth;

namespace AnimeHub.Api.Services;

public interface IAccountEmailSender
{
    Task SendEmailConfirmationAsync(ApplicationUser user, string token, HttpRequest request, CancellationToken cancellationToken = default);

    Task SendPasswordResetAsync(ApplicationUser user, string token, HttpRequest request, CancellationToken cancellationToken = default);
}

public sealed class AccountEmailSender : IAccountEmailSender
{
    private readonly IConfiguration _configuration;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<AccountEmailSender> _logger;

    public AccountEmailSender(
        IConfiguration configuration,
        IHostEnvironment environment,
        ILogger<AccountEmailSender> logger)
    {
        _configuration = configuration;
        _environment = environment;
        _logger = logger;
    }

    public Task SendEmailConfirmationAsync(
        ApplicationUser user,
        string token,
        HttpRequest request,
        CancellationToken cancellationToken = default)
    {
        var link = BuildFrontendUrl(request, "/confirm-email", new Dictionary<string, string?>
        {
            ["userId"] = user.Id.ToString(),
            ["token"] = token
        });

        return SendAccountEmailAsync(
            user,
            "Confirm your AnimeHub email",
            $"Confirm your AnimeHub account by opening this link: {link}",
            "email confirmation",
            token,
            cancellationToken);
    }

    public Task SendPasswordResetAsync(
        ApplicationUser user,
        string token,
        HttpRequest request,
        CancellationToken cancellationToken = default)
    {
        var link = BuildFrontendUrl(request, "/reset-password", new Dictionary<string, string?>
        {
            ["email"] = user.Email,
            ["token"] = token
        });

        return SendAccountEmailAsync(
            user,
            "Reset your AnimeHub password",
            $"Reset your AnimeHub password by opening this link: {link}",
            "password reset",
            token,
            cancellationToken);
    }

    private async Task SendAccountEmailAsync(
        ApplicationUser user,
        string subject,
        string body,
        string purpose,
        string token,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(user.Email))
            return;

        var host = _configuration["AccountEmail:Smtp:Host"];
        var from = _configuration["AccountEmail:FromEmail"];
        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(from))
        {
            if (_environment.IsDevelopment())
            {
                _logger.LogInformation(
                    "Development {Purpose} token for {Email}: {Token}",
                    purpose,
                    user.Email,
                    token);
            }
            else
            {
                _logger.LogWarning("Account email for {Purpose} was not sent because SMTP is not configured.", purpose);
            }

            return;
        }

        using var message = new MailMessage
        {
            From = new MailAddress(from, _configuration["AccountEmail:FromName"] ?? "AnimeHub"),
            Subject = subject,
            Body = body,
            IsBodyHtml = false
        };
        message.To.Add(user.Email);

        using var client = new SmtpClient(host, _configuration.GetValue("AccountEmail:Smtp:Port", 587))
        {
            EnableSsl = _configuration.GetValue("AccountEmail:Smtp:EnableSsl", true)
        };

        var username = _configuration["AccountEmail:Smtp:UserName"];
        var password = _configuration["AccountEmail:Smtp:Password"];
        if (!string.IsNullOrWhiteSpace(username) && !string.IsNullOrWhiteSpace(password))
            client.Credentials = new NetworkCredential(username, password);

        cancellationToken.ThrowIfCancellationRequested();
        await client.SendMailAsync(message);
    }

    private string BuildFrontendUrl(HttpRequest request, string path, IReadOnlyDictionary<string, string?> query)
    {
        var baseUrl = _configuration["AccountEmail:PublicBaseUrl"];
        if (string.IsNullOrWhiteSpace(baseUrl))
            baseUrl = _configuration["AccountEmail:ApiBaseUrl"];
        if (string.IsNullOrWhiteSpace(baseUrl))
            baseUrl = $"{request.Scheme}://{request.Host}";

        return BuildUrl(baseUrl, path, query);
    }

    private static string BuildUrl(string baseUrl, string path, IReadOnlyDictionary<string, string?> query)
    {
        var normalizedBase = baseUrl.TrimEnd('/');
        var normalizedPath = path.StartsWith('/') ? path : $"/{path}";
        var queryString = string.Join(
            "&",
            query
                .Where(pair => !string.IsNullOrWhiteSpace(pair.Value))
                .Select(pair => $"{Uri.EscapeDataString(pair.Key)}={Uri.EscapeDataString(pair.Value!)}"));

        return string.IsNullOrEmpty(queryString)
            ? $"{normalizedBase}{normalizedPath}"
            : $"{normalizedBase}{normalizedPath}?{queryString}";
    }
}
