FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY backend/AnimeHub.Domain/AnimeHub.Domain.csproj backend/AnimeHub.Domain/
COPY backend/AnimeHub.Infrastructure/AnimeHub.Infrastructure.csproj backend/AnimeHub.Infrastructure/
COPY backend/AnimeHub.Api/AnimeHub.Api.csproj backend/AnimeHub.Api/
RUN dotnet restore backend/AnimeHub.Api/AnimeHub.Api.csproj

COPY backend/ backend/
RUN dotnet publish backend/AnimeHub.Api/AnimeHub.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "AnimeHub.Api.dll"]
