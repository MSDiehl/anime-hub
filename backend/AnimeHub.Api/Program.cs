using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Threading.RateLimiting;
using AnimeHub.Api.Models;
using AnimeHub.Api.Middleware;
using AnimeHub.Api.Services;
using AnimeHub.Infrastructure.Auth;
using AnimeHub.Infrastructure.Data;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

LoadLocalDotEnv();

var builder = WebApplication.CreateBuilder(args);
const string CorsPolicyName = "ConfiguredCors";

// Controllers + Swagger
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHealthChecks();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            context.HttpContext.Response.Headers.RetryAfter =
                Math.Ceiling(retryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
        }

        await context.HttpContext.Response.WriteAsJsonAsync(
            ApiError.RateLimited("Too many requests. Try again shortly."),
            cancellationToken);
    };

    options.AddPolicy("auth", context => FixedWindow(context, permitLimit: 12, window: TimeSpan.FromMinutes(5)));
    options.AddPolicy("search", context => FixedWindow(context, permitLimit: 60, window: TimeSpan.FromMinutes(1)));
    options.AddPolicy("comments", context => FixedWindow(context, permitLimit: 20, window: TimeSpan.FromMinutes(1)));
    options.AddPolicy("reactions", context => FixedWindow(context, permitLimit: 90, window: TimeSpan.FromMinutes(1)));
    options.AddPolicy("reports", context => FixedWindow(context, permitLimit: 6, window: TimeSpan.FromHours(1)));
    options.AddPolicy("imports", context => FixedWindow(context, permitLimit: 4, window: TimeSpan.FromHours(1)));
});

builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "animehub.csrf";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.None
        : CookieSecurePolicy.Always;
});

// CORS is environment-configured so production only trusts explicit origins.
builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicyName, policy =>
    {
        var origins = builder.Configuration
            .GetSection("Cors:AllowedOrigins")
            .Get<string[]>() ?? [];

        if (origins.Length == 0 && builder.Environment.IsDevelopment())
            origins = ["http://localhost:5173"];

        policy
            .WithOrigins(origins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// HttpClient for AniList GraphQL
builder.Services.AddHttpClient("AniList", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["ExternalApis:AniList:BaseUrl"] ?? "https://graphql.anilist.co");
    client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
});

builder.Services.AddDbContext<AppDbContext>(opt =>
{
    var cs = builder.Configuration.GetConnectionString("Default");
    if (string.IsNullOrWhiteSpace(cs))
    {
        throw new InvalidOperationException(
            "ConnectionStrings:Default is not configured. Set ConnectionStrings__Default in .env, an environment variable, or .NET user-secrets before running the API or EF migrations.");
    }

    opt.UseNpgsql(cs);
});

var redisConnectionString = builder.Configuration.GetConnectionString("Redis");
if (!string.IsNullOrWhiteSpace(redisConnectionString))
{
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = redisConnectionString;
        options.InstanceName = "animehub:";
    });
}
else
{
    builder.Services.AddDistributedMemoryCache();
}

builder.Services.AddScoped<IScheduleDataService, ScheduleDataService>();
builder.Services.AddScoped<IAniListService, AniListService>();
builder.Services.AddScoped<IAccountEmailSender, AccountEmailSender>();
builder.Services.AddScoped<DevDataSeeder>();
builder.Services.AddHostedService<ScheduleRefreshService>();

builder.Services
    .AddIdentity<ApplicationUser, IdentityRole<Guid>>(options =>
    {
        options.User.RequireUniqueEmail = true;

        options.SignIn.RequireConfirmedEmail = builder.Configuration.GetValue(
            "Identity:RequireConfirmedEmail",
            true);

        options.Lockout.AllowedForNewUsers = true;
        options.Lockout.MaxFailedAccessAttempts = builder.Configuration.GetValue(
            "Identity:Lockout:MaxFailedAccessAttempts",
            builder.Environment.IsProduction() ? 5 : 8);
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(builder.Configuration.GetValue(
            "Identity:Lockout:Minutes",
            builder.Environment.IsProduction() ? 15 : 5));

        if (builder.Environment.IsProduction())
        {
            options.Password.RequiredLength = builder.Configuration.GetValue("Identity:Password:RequiredLength", 12);
            options.Password.RequiredUniqueChars = builder.Configuration.GetValue("Identity:Password:RequiredUniqueChars", 6);
            options.Password.RequireNonAlphanumeric = true;
            options.Password.RequireUppercase = true;
            options.Password.RequireLowercase = true;
            options.Password.RequireDigit = true;
        }
        else
        {
            options.Password.RequiredLength = builder.Configuration.GetValue("Identity:Password:RequiredLength", 8);
            options.Password.RequiredUniqueChars = builder.Configuration.GetValue("Identity:Password:RequiredUniqueChars", 4);
            options.Password.RequireNonAlphanumeric = false;
            options.Password.RequireUppercase = false;
            options.Password.RequireLowercase = true;
            options.Password.RequireDigit = false;
        }
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

builder.Services.AddAuthorization();

// cookie settings for dev
builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "animehub.auth";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.None
        : CookieSecurePolicy.Always;

    options.Events.OnRedirectToLogin = ctx =>
    {
        ctx.Response.StatusCode = 401;
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = ctx =>
    {
        ctx.Response.StatusCode = 403;
        return Task.CompletedTask;
    };
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var seeder = scope.ServiceProvider.GetRequiredService<DevDataSeeder>();
    await seeder.SeedAsync();
}

app.UseHttpsRedirection();

app.UseMiddleware<CorrelationIdMiddleware>();

app.UseRouting();

app.UseCors(CorsPolicyName);

app.UseAuthentication();

app.UseRateLimiter();

app.Use(async (context, next) =>
{
    if (RequiresCsrfValidation(context.Request))
    {
        var antiforgery = context.RequestServices.GetRequiredService<IAntiforgery>();
        try
        {
            await antiforgery.ValidateRequestAsync(context);
        }
        catch (AntiforgeryValidationException)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(ApiError.Validation("CSRF token is missing or invalid."));
            return;
        }
    }

    await next();
});

app.UseAuthorization();

if (app.Environment.IsDevelopment() || app.Configuration.GetValue("Swagger:Enabled", false))
{
    if (app.Environment.IsProduction() && app.Configuration.GetValue("Swagger:RequireAuthentication", true))
    {
        app.UseWhen(
            context => context.Request.Path.StartsWithSegments("/swagger"),
            branch =>
            {
                branch.Use(async (context, next) =>
                {
                    if (context.User.Identity?.IsAuthenticated == true)
                    {
                        await next();
                        return;
                    }

                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                });
            });
    }

    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapControllers();
app.MapHealthChecks("/health");

app.Run();

static bool RequiresCsrfValidation(HttpRequest request)
{
    if (!request.Path.StartsWithSegments("/api"))
        return false;

    return HttpMethods.IsPost(request.Method) ||
        HttpMethods.IsPut(request.Method) ||
        HttpMethods.IsPatch(request.Method) ||
        HttpMethods.IsDelete(request.Method);
}

static RateLimitPartition<string> FixedWindow(HttpContext context, int permitLimit, TimeSpan window)
{
    return RateLimitPartition.GetFixedWindowLimiter(
        ClientPartitionKey(context),
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = permitLimit,
            Window = window,
            QueueLimit = 0,
            AutoReplenishment = true
        });
}

static string ClientPartitionKey(HttpContext context)
{
    var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!string.IsNullOrWhiteSpace(userId))
        return $"user:{userId}";

    return $"ip:{context.Connection.RemoteIpAddress?.ToString() ?? "unknown"}";
}

static void LoadLocalDotEnv()
{
    var currentEnvironment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
        ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");
    if (string.Equals(currentEnvironment, Environments.Production, StringComparison.OrdinalIgnoreCase))
        return;

    var envPath = FindFileUpwards(Directory.GetCurrentDirectory(), ".env");
    if (envPath == null)
        return;

    foreach (var rawLine in File.ReadAllLines(envPath))
    {
        var line = rawLine.Trim();
        if (line.Length == 0 || line.StartsWith('#'))
            continue;

        if (line.StartsWith("export ", StringComparison.Ordinal))
            line = line["export ".Length..].TrimStart();

        var separator = line.IndexOf('=');
        if (separator <= 0)
            continue;

        var key = line[..separator].Trim();
        var value = line[(separator + 1)..].Trim();
        if (key.Length == 0 || Environment.GetEnvironmentVariable(key) != null)
            continue;

        if ((value.StartsWith('"') && value.EndsWith('"')) ||
            (value.StartsWith('\'') && value.EndsWith('\'')))
        {
            value = value[1..^1];
        }

        Environment.SetEnvironmentVariable(key, value);
    }
}

static string? FindFileUpwards(string startDirectory, string fileName)
{
    var directory = new DirectoryInfo(startDirectory);
    while (directory != null)
    {
        var candidate = Path.Combine(directory.FullName, fileName);
        if (File.Exists(candidate))
            return candidate;

        directory = directory.Parent;
    }

    return null;
}
