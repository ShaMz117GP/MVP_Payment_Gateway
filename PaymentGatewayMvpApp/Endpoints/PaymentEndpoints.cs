using PaymentGatewayMvpApp.Domain;
using PaymentGatewayMvpApp.Services;

namespace PaymentGatewayMvpApp.Endpoints;

public static class PaymentEndpoints
{
    public static void MapPaymentEndpoints(this WebApplication app)
    {
        app.MapPost("/payments", (CreatePaymentRequest request, HttpRequest httpRequest, PaymentStore store) =>
        {
            if (request.Amount <= 0)
            {
                return Results.BadRequest(new { error = "Amount must be greater than 0." });
            }

            if (string.IsNullOrWhiteSpace(request.Currency))
            {
                return Results.BadRequest(new { error = "Currency is required." });
            }

            if (string.IsNullOrWhiteSpace(request.MerchantReference))
            {
                return Results.BadRequest(new { error = "MerchantReference is required." });
            }

            if (request.CardLast4?.Length != 4 || !request.CardLast4.All(char.IsDigit))
            {
                return Results.BadRequest(new { error = "CardLast4 must be exactly 4 digits." });
            }

            if (!httpRequest.Headers.TryGetValue("Idempotency-Key", out var idempotencyKey) ||
                string.IsNullOrWhiteSpace(idempotencyKey))
            {
                return Results.BadRequest(new { error = "Idempotency-Key header is required." });
            }

            var result = store.Create(request, idempotencyKey.ToString().Trim());
            return Results.Json(result.Response, statusCode: result.StatusCode);
        });

        app.MapGet("/payments/{id:guid}", (Guid id, PaymentStore store) =>
        {
            return store.TryGet(id, out var payment)
                ? Results.Ok(payment)
                : Results.NotFound(new { error = "Payment not found." });
        });

        app.MapPost("/payments/{id:guid}/capture", (Guid id, PaymentStore store) =>
        {
            var result = store.Capture(id);
            return Results.Json(result.Response, statusCode: result.StatusCode);
        });

        app.MapPost("/payments/{id:guid}/authorise", (Guid id, HttpRequest httpRequest, PaymentStore store) =>
        {
            httpRequest.Headers.TryGetValue("X-Processor-Mode", out var mode);
            var result = store.Authorise(id, mode.ToString());
            return Results.Json(result.Response, statusCode: result.StatusCode);
        });

        app.MapPost("/payments/{id:guid}/refund", (Guid id, PaymentStore store) =>
        {
            var result = store.Refund(id);
            return Results.Json(result.Response, statusCode: result.StatusCode);
        });

        app.MapGet("/payments/{id:guid}/history", (Guid id, PaymentStore store) =>
        {
            var history = store.GetHistory(id);
            return history is null
                ? Results.NotFound(new { error = "Payment not found." })
                : Results.Ok(history);
        });
    }
}
