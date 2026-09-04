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
            CommandMenu("Edit Chart") {
                Button("Duplicate Change") { store.duplicateSelectedChord() }
                    .keyboardShortcut("d", modifiers: .command)
                    .disabled(!store.canDuplicateSelectedChord)
                Button("Delete Change") { store.deleteSelectedChord() }
                    .keyboardShortcut(.delete, modifiers: .command)
                    .disabled(!store.canDeleteSelectedChord)
                Divider()
                Button("Move Change Earlier") { store.moveSelectedChord(by: -1) }
                    .keyboardShortcut(.leftArrow, modifiers: [.command, .option])
                    .disabled(!store.canMoveSelectedChordEarlier)
                Button("Move Change Later") { store.moveSelectedChord(by: 1) }
                    .keyboardShortcut(.rightArrow, modifiers: [.command, .option])
                    .disabled(!store.canMoveSelectedChordLater)
                Divider()
                Button("Insert Bar After") {
                    if let id = store.selectedMeasureID { store.insertMeasure(after: id) }
                }
                Button("Delete Bar") {
                    if let id = store.selectedMeasureID { store.deleteMeasure(id) }
                }
                .disabled(!store.canDeleteSelectedMeasure)
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
            JazzTextSizeCommands()
        }
    }
}

private struct JazzTextSizeCommands: Commands {
    @AppStorage(JazzTheme.textScaleStorageKey) private var textScale = JazzTheme.defaultTextScale

    var body: some Commands {
        CommandMenu("Text Size") {
            Button("Larger Text") {
                textScale = JazzTheme.adjustedTextScale(from: textScale, steps: 1)
            }
            .keyboardShortcut("+", modifiers: .command)
            .disabled(JazzTheme.normalizedTextScale(textScale) >= JazzTheme.maximumTextScale)

            Button("Smaller Text") {
                textScale = JazzTheme.adjustedTextScale(from: textScale, steps: -1)
            }
            .keyboardShortcut("-", modifiers: .command)
            .disabled(JazzTheme.normalizedTextScale(textScale) <= JazzTheme.minimumTextScale)

            Button("Actual Size") {
                textScale = JazzTheme.defaultTextScale
            }
            .keyboardShortcut("0", modifiers: .command)
            .disabled(JazzTheme.normalizedTextScale(textScale) == JazzTheme.defaultTextScale)
        }
    }
}
