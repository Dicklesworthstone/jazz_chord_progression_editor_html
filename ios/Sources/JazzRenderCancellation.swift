import Foundation

/// Thread-safe cancellation shared by the main actor and synchronous render
/// workers. `Task.cancel()` cannot cross the detached, synchronous Rust FFI
/// boundary by itself, so the renderer checks this token between bounded Rust
/// work quanta and at bounded intervals in Swift mixing loops.
final class JazzRenderCancellationToken: @unchecked Sendable {
    private let condition = NSCondition()
    private var cancelled = false
    private var enteredCooperativeRuntimes = 0
    private var completedCooperativeSteps = 0
    private var cancellationHandlers: [UUID: @Sendable () -> Void] = [:]

    var isCancelled: Bool {
        condition.lock()
        defer { condition.unlock() }
        return cancelled
    }

    var cooperativeStepCount: Int {
        condition.lock()
        defer { condition.unlock() }
        return completedCooperativeSteps
    }

    var cooperativeRuntimeEntryCount: Int {
        condition.lock()
        defer { condition.unlock() }
        return enteredCooperativeRuntimes
    }

    func cancel() {
        condition.lock()
        cancelled = true
        let handlers = Array(cancellationHandlers.values)
        cancellationHandlers.removeAll(keepingCapacity: false)
        condition.broadcast()
        condition.unlock()
        for handler in handlers { handler() }
    }

    /// Registers an interrupt that is safe to invoke from the actor calling
    /// `cancel()`. A late registration after cancellation fires immediately.
    func registerCancellationHandler(_ handler: @escaping @Sendable () -> Void) -> UUID? {
        condition.lock()
        if cancelled {
            condition.unlock()
            handler()
            return nil
        }
        let identifier = UUID()
        cancellationHandlers[identifier] = handler
        condition.unlock()
        return identifier
    }

    func unregisterCancellationHandler(_ identifier: UUID?) {
        guard let identifier else { return }
        condition.lock()
        cancellationHandlers.removeValue(forKey: identifier)
        condition.unlock()
    }

    /// Called only after an opaque Rust handle exists and its cross-thread
    /// interrupt has been registered. This lets tests synchronize with a live
    /// session without sleeping or waiting for an expensive work quantum.
    @discardableResult
    func enteredCooperativeRuntime() -> Bool {
        condition.lock()
        enteredCooperativeRuntimes += 1
        let shouldContinue = !cancelled
        condition.broadcast()
        condition.unlock()
        return shouldContinue
    }

    /// Called after a Rust runtime returns `progress`. Besides forming the next
    /// cancellation fence, the count lets tests prove cancellation happened
    /// during a live cooperative session rather than before FFI entry.
    @discardableResult
    func completedCooperativeStep() -> Bool {
        condition.lock()
        completedCooperativeSteps += 1
        let shouldContinue = !cancelled
        condition.broadcast()
        condition.unlock()
        return shouldContinue
    }

    /// Test-only observation seam with no timing sleeps. Production never
    /// waits on the renderer; it only reads `isCancelled`.
    func waitForCooperativeStep(after previousCount: Int = 0, timeout: TimeInterval) -> Bool {
        let deadline = Date(timeIntervalSinceNow: timeout)
        condition.lock()
        defer { condition.unlock() }
        while completedCooperativeSteps <= previousCount, !cancelled {
            guard condition.wait(until: deadline) else { break }
        }
        return completedCooperativeSteps > previousCount
    }

    func waitForCooperativeRuntimeEntry(after previousCount: Int = 0, timeout: TimeInterval) -> Bool {
        let deadline = Date(timeIntervalSinceNow: timeout)
        condition.lock()
        defer { condition.unlock() }
        while enteredCooperativeRuntimes <= previousCount, !cancelled {
            guard condition.wait(until: deadline) else { break }
        }
        return enteredCooperativeRuntimes > previousCount
    }
}
