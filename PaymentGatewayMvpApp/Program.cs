using Microsoft.EntityFrameworkCore;
using PaymentGatewayMvpApp.Endpoints;
using PaymentGatewayMvpApp.Infrastructure;
using PaymentGatewayMvpApp.Services;

var builder = WebApplication.CreateBuilder(args);

const string DemoUiCors = "DemoUiCors";

builder.Services.AddDbContext<PaymentsDbContext>(options =>
    options.UseSqlite("Data Source=payments.db"));
builder.Services.AddSingleton<FakeProcessor>();
builder.Services.AddScoped<PaymentStore>();
builder.Services.AddCors(options =>
{
    options.AddPolicy(DemoUiCors, policy =>
    {
        policy
            .WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<PaymentsDbContext>();
    db.Database.EnsureCreated();
}

app.MapGet("/", () => Results.Ok(new { service = "PaymentGatewayMvp", status = "running" }));
app.UseCors(DemoUiCors);
app.MapPaymentEndpoints();

app.Run();
