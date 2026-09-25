import {
  assertDispatchCanBeConfirmed,
  assertDispatchCanBeFulfilled,
  DispatchRequestStatus,
  DispatchRequestType,
  statusAfterFulfillment,
} from './dispatch-request.policy';

describe('dispatch request policy', () => {
  it('closes an internal supply when warehouse fulfills it', () => {
    expect(statusAfterFulfillment(DispatchRequestType.INTERNAL_SUPPLY)).toBe(
      DispatchRequestStatus.CONFIRMED,
    );
  });

  it('waits for technician confirmation after a warranty replacement', () => {
    expect(statusAfterFulfillment(DispatchRequestType.WARRANTY_REPLACEMENT)).toBe(
      DispatchRequestStatus.DELIVERED,
    );
  });

  it('does not fulfill an already processed request', () => {
    expect(() => assertDispatchCanBeFulfilled(DispatchRequestStatus.DELIVERED)).toThrow();
  });

  it('only confirms a delivered warranty replacement', () => {
    expect(() =>
      assertDispatchCanBeConfirmed(
        DispatchRequestType.INTERNAL_SUPPLY,
        DispatchRequestStatus.DELIVERED,
      ),
    ).toThrow();
    expect(() =>
      assertDispatchCanBeConfirmed(
        DispatchRequestType.WARRANTY_REPLACEMENT,
        DispatchRequestStatus.PENDING,
      ),
    ).toThrow();
    expect(() =>
      assertDispatchCanBeConfirmed(
        DispatchRequestType.WARRANTY_REPLACEMENT,
        DispatchRequestStatus.DELIVERED,
      ),
    ).not.toThrow();
  });
});
