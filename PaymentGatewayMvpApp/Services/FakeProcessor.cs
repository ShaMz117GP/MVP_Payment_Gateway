using PaymentGatewayMvpApp.Domain;

namespace PaymentGatewayMvpApp.Services;

public sealed class FakeProcessor
{
    public ProcessorOutcome ProcessAuthorisation(Payment payment, string? requestedMode)
    {
        if (!string.IsNullOrWhiteSpace(requestedMode))
        {
            return requestedMode.Trim().ToLowerInvariant() switch
            {
                "success" => ProcessorOutcome.Success,
                "decline" => ProcessorOutcome.Decline,
                "timeout" => ProcessorOutcome.Timeout,
                _ => ProcessorOutcome.InvalidMode
            };
        }

        // Keep default deterministic and explicit for tests.
        var amountInCents = (int)Math.Round(payment.Amount * 100, MidpointRounding.AwayFromZero);
        return amountInCents % 2 == 0 ? ProcessorOutcome.Success : ProcessorOutcome.Decline;
    }
}

public enum ProcessorOutcome
{
    Success = 1,
    Decline = 2,
    Timeout = 3,
    InvalidMode = 4
}
