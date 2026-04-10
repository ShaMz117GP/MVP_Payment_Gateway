using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PaymentGatewayMvpApp.Domain;
using PaymentGatewayMvpApp.Infrastructure;

namespace PaymentGatewayMvpApp.Services;

public sealed class PaymentStore
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    private readonly PaymentsDbContext _dbContext;
    private readonly FakeProcessor _fakeProcessor;

    public PaymentStore(PaymentsDbContext dbContext, FakeProcessor fakeProcessor)
    {
        _dbContext = dbContext;
        _fakeProcessor = fakeProcessor;
    }

    public bool TryGet(Guid id, out Payment? payment)
    {
        payment = _dbContext.Payments
            .Include(x => x.History)
            .SingleOrDefault(x => x.Id == id);
        return payment is not null;
    }

    public IReadOnlyList<History>? GetHistory(Guid id)
    {
        var payment = _dbContext.Payments
            .Include(x => x.History)
            .SingleOrDefault(x => x.Id == id);
        return payment?.History.OrderBy(x => x.At).ToList();
    }

    public (int StatusCode, object Response) Create(CreatePaymentRequest request, string idempotencyKey)
    {
        var fingerprint = JsonSerializer.Serialize(request);

        var existing = _dbContext.IdempotencyRecords.SingleOrDefault(x => x.Key == idempotencyKey);
        if (existing is not null)
        {
            if (!string.Equals(existing.Fingerprint, fingerprint, StringComparison.Ordinal))
            {
                return (409, new { error = "Idempotency key already used with different request payload." });
            }

            var storedResponse = JsonSerializer.Deserialize<CreatePaymentResponse>(existing.ResponseBody, SerializerOptions);
            if (storedResponse is null)
            {
                return (500, new { error = "Failed to deserialize stored idempotent response." });
            }

            return (existing.ResponseStatusCode, storedResponse);
        }

        var payment = new Payment
        {
            Amount = request.Amount,
            Currency = request.Currency.Trim().ToUpperInvariant(),
            MerchantReference = request.MerchantReference.Trim(),
            CardLast4 = request.CardLast4.Trim()
        };

        payment.History.Add(new History
        {
            PaymentId = payment.Id,
            At = DateTimeOffset.UtcNow,
            Status = payment.Status,
            Note = "Payment created."
        });

        var createdResponse = new CreatePaymentResponse(payment, false);
        var responseBody = JsonSerializer.Serialize(createdResponse, SerializerOptions);

        _dbContext.Payments.Add(payment);
        _dbContext.IdempotencyRecords.Add(new IdempotencyRecord
        {
            Key = idempotencyKey,
            Fingerprint = fingerprint,
            ResponseStatusCode = 201,
            ResponseBody = responseBody,
            CreatedAt = DateTimeOffset.UtcNow
        });
        _dbContext.SaveChanges();

        return (201, createdResponse);
    }

    public (int StatusCode, object Response) Capture(Guid id)
    {
        var payment = _dbContext.Payments
            .Include(x => x.History)
            .SingleOrDefault(x => x.Id == id);
        if (payment is null)
        {
            return (404, new { error = "Payment not found." });
        }

        if (payment.Status != Status.Authorised)
        {
            return (409, new { error = $"Only Authorised payments can be captured. Current status: {payment.Status}." });
        }

        payment.Status = Status.Captured;
        payment.History.Add(new History
        {
            PaymentId = payment.Id,
            At = DateTimeOffset.UtcNow,
            Status = payment.Status,
            Note = "Payment captured."
        });
        _dbContext.SaveChanges();

        return (200, new OperationResponse(payment, "Payment captured."));
    }

    public (int StatusCode, object Response) Authorise(Guid id, string? requestedMode)
    {
        var payment = _dbContext.Payments
            .Include(x => x.History)
            .SingleOrDefault(x => x.Id == id);
        if (payment is null)
        {
            return (404, new { error = "Payment not found." });
        }

        if (payment.Status != Status.Created)
        {
            return (409, new { error = $"Only Created payments can be authorised. Current status: {payment.Status}." });
        }

        var outcome = _fakeProcessor.ProcessAuthorisation(payment, requestedMode);
        if (outcome == ProcessorOutcome.InvalidMode)
        {
            return (400, new { error = "Invalid X-Processor-Mode. Allowed values: success, decline, timeout." });
        }

        if (outcome == ProcessorOutcome.Success)
        {
            payment.Status = Status.Authorised;
            payment.History.Add(new History
            {
                PaymentId = payment.Id,
                At = DateTimeOffset.UtcNow,
                Status = payment.Status,
                Note = "Processor success: payment authorised."
            });
            _dbContext.SaveChanges();
            return (200, new OperationResponse(payment, "Payment authorised."));
        }

        if (outcome == ProcessorOutcome.Decline)
        {
            payment.History.Add(new History
            {
                PaymentId = payment.Id,
                At = DateTimeOffset.UtcNow,
                Status = payment.Status,
                Note = "Processor declined payment."
            });
            _dbContext.SaveChanges();
            return (402, new { error = "Processor declined payment." });
        }

        payment.History.Add(new History
        {
            PaymentId = payment.Id,
            At = DateTimeOffset.UtcNow,
            Status = payment.Status,
            Note = "Processor timeout."
        });
        _dbContext.SaveChanges();
        return (504, new { error = "Processor timeout." });
    }

    public (int StatusCode, object Response) Refund(Guid id)
    {
        var payment = _dbContext.Payments
            .Include(x => x.History)
            .SingleOrDefault(x => x.Id == id);
        if (payment is null)
        {
            return (404, new { error = "Payment not found." });
        }

        if (payment.Status != Status.Captured)
        {
            return (409, new { error = $"Only Captured payments can be refunded. Current status: {payment.Status}." });
        }

        payment.Status = Status.Refunded;
        payment.History.Add(new History
        {
            PaymentId = payment.Id,
            At = DateTimeOffset.UtcNow,
            Status = payment.Status,
            Note = "Payment refunded."
        });
        _dbContext.SaveChanges();

        return (200, new OperationResponse(payment, "Payment refunded."));
    }
}
