/**
 * services/websocket.ts
 *
 * WHERE THIS FILE LIVES: frontend/services/websocket.ts
 *
 * Connects to the backend audit pipeline WebSocket.
 * Backend sends stage messages; this service translates them into
 * store actions and chat messages the UI can display.
 *
 * The one message the frontend must SEND back is when stage === "validation_required":
 *   { approved: true, corrections: [] }
 * The useAuditSession hook handles collecting that from the user.
 */
import type { WSStageMessage, IdentifiedDoc, DocumentCorrection } from '@/types'
import { buildWsUrl } from './api'

type StageHandler = (msg: WSStageMessage) => void
type StatusHandler = (connected: boolean) => void

class AuditWebSocketService {
  private ws: WebSocket | null = null
  private stageHandlers = new Set<StageHandler>()
  private statusHandlers = new Set<StatusHandler>()
  private sessionId = ''

  connect(sessionId: string): WebSocket {
    this.sessionId = sessionId
    const url = buildWsUrl(sessionId)
    this.ws = new WebSocket(url)

    this.ws.onopen = () => this.notifyStatus(true)
    this.ws.onclose = () => this.notifyStatus(false)
    this.ws.onerror = () => this.notifyStatus(false)

    this.ws.onmessage = (e) => {
      console.log("========== WS RAW ==========")
      console.log(e.data)

      try {
        const msg: WSStageMessage = JSON.parse(e.data)

        console.log("========== WS PARSED ==========")
        console.log(msg)

        this.stageHandlers.forEach(h => h(msg))
      } catch (err) {
        console.error("WS parse error")
        console.error(err)
        console.error(e.data)
      }
    }

    return this.ws
  }

  /**
   * Send validation answer back to the backend pipeline.
   * Call this after user approves/corrects the document identification.
   */
  sendValidationAnswer(approved: boolean, corrections: DocumentCorrection[] = []) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ approved, corrections }))
    }
  }

  onStage(handler: StageHandler) {
    this.stageHandlers.add(handler)
    return () => this.stageHandlers.delete(handler)
  }

  onStatus(handler: StatusHandler) {
    this.statusHandlers.add(handler)
    return () => this.statusHandlers.delete(handler)
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
    this.stageHandlers.clear()
    this.statusHandlers.clear()
  }

  private notifyStatus(connected: boolean) {
    this.statusHandlers.forEach(h => h(connected))
  }
}

export const auditWsService = new AuditWebSocketService()
