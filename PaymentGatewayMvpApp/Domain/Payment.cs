namespace PaymentGatewayMvpApp.Domain;

public sealed class Payment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public decimal Amount { get; set; }
    public string Currency { get; set; } = string.Empty;
    public string MerchantReference { get; set; } = string.Empty;
    public string CardLast4 { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Status Status { get; set; } = Status.Created;
    public List<History> History { get; set; } = new();
}
