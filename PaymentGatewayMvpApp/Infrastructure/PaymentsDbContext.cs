using Microsoft.EntityFrameworkCore;
using PaymentGatewayMvpApp.Domain;

namespace PaymentGatewayMvpApp.Infrastructure;

public sealed class PaymentsDbContext : DbContext
{
    public PaymentsDbContext(DbContextOptions<PaymentsDbContext> options) : base(options)
    {
    }

    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<History> History => Set<History>();
    public DbSet<IdempotencyRecord> IdempotencyRecords => Set<IdempotencyRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Payment>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Currency).HasMaxLength(3).IsRequired();
            entity.Property(x => x.MerchantReference).HasMaxLength(100).IsRequired();
            entity.Property(x => x.CardLast4).HasMaxLength(4).IsRequired();
            entity.Property(x => x.Amount).HasColumnType("decimal(18,2)");
            entity.Property(x => x.Status).IsRequired();
            entity.Property(x => x.CreatedAt).IsRequired();
            entity.HasMany(x => x.History)
                .WithOne(x => x.Payment)
                .HasForeignKey(x => x.PaymentId);
        });

        modelBuilder.Entity<History>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.At).IsRequired();
            entity.Property(x => x.Status).IsRequired();
            entity.Property(x => x.Note).HasMaxLength(200).IsRequired();
        });

        modelBuilder.Entity<IdempotencyRecord>(entity =>
        {
            entity.HasKey(x => x.Key);
            entity.Property(x => x.Fingerprint).IsRequired();
            entity.Property(x => x.ResponseStatusCode).IsRequired();
            entity.Property(x => x.ResponseBody).IsRequired();
            entity.Property(x => x.CreatedAt).IsRequired();
        });
    }
}
