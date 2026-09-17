# Keep direct-service commercial state consistent

An Express order creates accepted commercial versions and a confirmed agreement during reception, but leaves the order commitment at zero and its economic status as not applicable. Consumers that use the order projection therefore cannot start the sale.

When the initial confirmed agreement is created, update the order commitment and economic status in the same transaction.
