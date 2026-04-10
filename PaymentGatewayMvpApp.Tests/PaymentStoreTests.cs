using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using PaymentGatewayMvpApp.Domain;
using PaymentGatewayMvpApp.Infrastructure;
using PaymentGatewayMvpApp.Services;

namespace PaymentGatewayMvpApp.Tests;

public sealed class PaymentStoreTests
{
    [Fact]
    public void Create_IsIdempotent_And_RejectsDifferentPayloadForSameKey()
    {
        using var fixture = new TestFixture();
        var request = new CreatePaymentRequest(10.50m, "zar", "ORDER-1", "1234");

        var first = fixture.Store.Create(request, "idem-1");
        var replay = fixture.Store.Create(request, "idem-1");
        var conflict = fixture.Store.Create(request with { Amount = 11.00m }, "idem-1");

        Assert.Equal(201, first.StatusCode);
        Assert.Equal(201, replay.StatusCode);
        Assert.Equal(409, conflict.StatusCode);

        var firstResponse = Assert.IsType<CreatePaymentResponse>(first.Response);
        var replayResponse = Assert.IsType<CreatePaymentResponse>(replay.Response);
        Assert.Equal(firstResponse.Payment.Id, replayResponse.Payment.Id);
        Assert.Equal(firstResponse.Payment.Status, replayResponse.Payment.Status);
        Assert.Equal(firstResponse.Payment.CreatedAt, replayResponse.Payment.CreatedAt);
    }

    [Fact]
    public void Lifecycle_Create_Authorise_Capture_Refund_Works()
    {
        using var fixture = new TestFixture();
        var request = new CreatePaymentRequest(20.00m, "zar", "ORDER-2", "5678");
        var create = fixture.Store.Create(request, "idem-2");
        var paymentId = Assert.IsType<CreatePaymentResponse>(create.Response).Payment.Id;

        var authorise = fixture.Store.Authorise(paymentId, "success");
        var capture = fixture.Store.Capture(paymentId);
        var refund = fixture.Store.Refund(paymentId);

        Assert.Equal(200, authorise.StatusCode);
        Assert.Equal(200, capture.StatusCode);
        Assert.Equal(200, refund.StatusCode);

        Assert.True(fixture.Store.TryGet(paymentId, out var payment));
        Assert.NotNull(payment);
        Assert.Equal(Status.Refunded, payment!.Status);

        var history = fixture.Store.GetHistory(paymentId);
        Assert.NotNull(history);
        Assert.Equal(4, history!.Count);
    }

    [Fact]
    public void Authorise_Timeout_ReturnsFailure_AndKeepsCreatedState()
    {
        using var fixture = new TestFixture();
        var request = new CreatePaymentRequest(30.00m, "zar", "ORDER-3", "9999");
        var create = fixture.Store.Create(request, "idem-3");
        var paymentId = Assert.IsType<CreatePaymentResponse>(create.Response).Payment.Id;

        var authorise = fixture.Store.Authorise(paymentId, "timeout");

        Assert.Equal(504, authorise.StatusCode);
        Assert.True(fixture.Store.TryGet(paymentId, out var payment));
        Assert.Equal(Status.Created, payment!.Status);

        var history = fixture.Store.GetHistory(paymentId);
        Assert.NotNull(history);
        Assert.Contains(history!, x => x.Note.Contains("timeout", StringComparison.OrdinalIgnoreCase));
    }

    private sealed class TestFixture : IDisposable
    {
        private readonly SqliteConnection _connection;
        private readonly PaymentsDbContext _dbContext;

        public PaymentStore Store { get; }

        public TestFixture()
        {
            _connection = new SqliteConnection("DataSource=:memory:");
            _connection.Open();

            var options = new DbContextOptionsBuilder<PaymentsDbContext>()
                .UseSqlite(_connection)
                .Options;

            _dbContext = new PaymentsDbContext(options);
            _dbContext.Database.EnsureCreated();

            Store = new PaymentStore(_dbContext, new FakeProcessor());
        }

        public void Dispose()
        {
            _dbContext.Dispose();
            _connection.Dispose();
        }
    }
}
