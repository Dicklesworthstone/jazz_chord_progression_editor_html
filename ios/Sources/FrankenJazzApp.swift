import SwiftUI

@main
struct FrankenJazzApp: App {
    @StateObject private var store = JazzStudioStore()

    var body: some Scene {
        WindowGroup {
            FrankenJazzStudioView(store: store)
                .background(CatalystWindowFreedom())
                .onOpenURL { url in Task { await store.importFile(url) } }
#if targetEnvironment(macCatalyst)
                .frame(minWidth: 860, minHeight: 600)
#endif
        }
#if targetEnvironment(macCatalyst)
        .defaultSize(width: 1460, height: 920)
        .windowResizability(.contentMinSize)
#endif
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Chart") { store.newChart() }
                    .keyboardShortcut("n", modifiers: .command)
                Button("Open or Export…") { store.isDocumentPresented = true }
                    .keyboardShortcut("o", modifiers: [.command, .shift])
                Button("Save Copy…") { store.requestSaveCopy() }
                    .keyboardShortcut("s", modifiers: [.command, .shift])
            }
            CommandGroup(replacing: .undoRedo) {
                Button("Undo") { store.undo() }
                    .keyboardShortcut("z", modifiers: .command)
                    .disabled(!store.canUndo)
                Button("Redo") { store.redo() }
                    .keyboardShortcut("z", modifiers: [.command, .shift])
                    .disabled(!store.canRedo)
            }
            CommandMenu("Playback") {
                Button(store.audio.isPlaying ? "Pause" : "Play") { store.audio.toggle(chart: store.chart) }
                    .keyboardShortcut(.space, modifiers: [])
                Button("Stop") { store.audio.stop() }
                    .keyboardShortcut(".", modifiers: .command)
                Toggle("Loop Chart", isOn: Binding(get: { store.audio.loops }, set: { store.audio.loops = $0 }))
            }
            CommandMenu("Harmony") {
                Button("Transpose Up a Semitone") { store.transpose(1) }
                    .keyboardShortcut(.upArrow, modifiers: [.command, .option])
                Button("Transpose Down a Semitone") { store.transpose(-1) }
                    .keyboardShortcut(.downArrow, modifiers: [.command, .option])
                Button("Show Chord Inspector") { store.isInspectorPresented = true }
                    .keyboardShortcut("i", modifiers: [.command, .option])
            }
        }
    }
}
