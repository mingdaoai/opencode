import type { Event } from "@opencode-ai/sdk/v2"
import { useProject } from "./project"
import { useSDK } from "./sdk"

export function useEvent() {
  const project = useProject()
  const sdk = useSDK()

  function subscribe(handler: (event: Event) => void) {
    return sdk.event.on("event", (event) => {
      if (event.payload.type === "sync") {
        return
      }

      // ToastShow events are user-visible notifications that
      // should always render, regardless of which directory or
      // workspace triggered them. Without this bypass they are
      // silently dropped when the event envelope lacks a matching
      // directory scope (e.g., server-side plugin toasts).
      if (event.payload.type === "tui.toast.show") {
        handler(event.payload)
        return
      }

      // Special hack for truly global events
      if (event.directory === "global") {
        handler(event.payload)
      }

      if (project.workspace.current()) {
        if (event.workspace === project.workspace.current()) {
          handler(event.payload)
        }

        return
      }

      if (event.directory === project.instance.directory()) {
        handler(event.payload)
      }
    })
  }

  function on<T extends Event["type"]>(type: T, handler: (event: Extract<Event, { type: T }>) => void) {
    return subscribe((event) => {
      if (event.type !== type) return
      handler(event as Extract<Event, { type: T }>)
    })
  }

  return {
    subscribe,
    on,
  }
}
