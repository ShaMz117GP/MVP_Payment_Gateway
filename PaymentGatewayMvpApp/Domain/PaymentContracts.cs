namespace PaymentGatewayMvpApp.Domain;

public sealed record CreatePaymentRequest(
    decimal Amount,
    string Currency,
    string MerchantReference,
    string CardLast4
);

public sealed record CreatePaymentResponse(
    Payment Payment,
    bool IdempotentReplay
);

public sealed record OperationResponse(
    Payment Payment,
    string Message
);
