using System.Net.Http.Headers;
using AnimeHub.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Controllers + Swagger
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// CORS for Vite dev server
builder.Services.AddCors(options =>
{
    options.AddPolicy("DevCors", policy =>
    {
        policy
            .WithOrigins("http://localhost:5173") // Vite default
            .AllowAnyHeader()
            .AllowAnyMethod();
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
    opt.UseNpgsql(cs);
});

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();

app.UseHttpsRedirection();

app.UseCors("DevCors");

app.MapControllers();

app.Run();
