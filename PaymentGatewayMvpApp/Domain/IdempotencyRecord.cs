namespace PaymentGatewayMvpApp.Domain;

public sealed class IdempotencyRecord
{
    public string Key { get; set; } = string.Empty;
    public string Fingerprint { get; set; } = string.Empty;
    public int ResponseStatusCode { get; set; }
    public string ResponseBody { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
