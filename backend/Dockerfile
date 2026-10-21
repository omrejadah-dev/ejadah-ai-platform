# API (ASP.NET Core, .NET 10). Build context: backend/
#   docker build -t ejadah-api backend
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Ejadah.Ai.Api/Ejadah.Ai.Api.csproj Ejadah.Ai.Api/
RUN dotnet restore Ejadah.Ai.Api/Ejadah.Ai.Api.csproj
COPY Ejadah.Ai.Api Ejadah.Ai.Api
RUN dotnet publish Ejadah.Ai.Api/Ejadah.Ai.Api.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
# Npgsql probes for Kerberos at startup; the library silences a harmless warning
RUN apt-get update && apt-get install -y --no-install-recommends libgssapi-krb5-2 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_URLS=http://+:8080 ASPNETCORE_ENVIRONMENT=Production DOTNET_gcServer=1
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD ["dotnet", "Ejadah.Ai.Api.dll", "--healthcheck"]
ENTRYPOINT ["dotnet", "Ejadah.Ai.Api.dll"]
