using System.Text.Json.Serialization;

namespace PaymentGatewayMvpApp.Domain;

public sealed class History
{
    public long Id { get; set; }
    public Guid PaymentId { get; set; }
    public DateTimeOffset At { get; set; }
    public Status Status { get; set; }
    public string Note { get; set; } = string.Empty;
    [JsonIgnore]
    public Payment? Payment { get; set; }
}
