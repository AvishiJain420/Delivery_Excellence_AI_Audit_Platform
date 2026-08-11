/**
 * store/index.ts
 *
 * WHERE THIS FILE LIVES: frontend/store/index.ts
 *
 * Global state. Two stores:
 *   useAuditStore — audit session state, pipeline stages, chat messages, live log
 *   useUIStore    — sidebar, notification panel
 *
 * The handleStage() action is the core bridge between backend WebSocket
 * messages and the UI. Every backend stage message gets translated here
 * into store updates that drive the UI.
 */
import { create } from 'zustand'
import type {
  AuditSession, AuditStep, AuditDocument, ChatMessage,ChatMessageType,
  LiveLogEntry, WSStageMessage, IdentifiedDoc, StepStatus,DocumentStatus
} from '@/types'
import { PIPELINE_STEPS, STAGE_TO_STEP } from '@/lib/utils'

// ─── Audit Store ───────────────────────────────────────────────────────────────
interface AuditState {
  session: AuditSession | null
  chatMessages: ChatMessage[]
  liveLog: LiveLogEntry[]
  isConnected: boolean
  pendingValidation: IdentifiedDoc[] | null  // set when backend needs user approval
  frameworkCategories: string[]  // set when backend sends framework categories

  initSession: (id: string, name: string, projectName: string, clientName: string, auditType: string) => void
  handleStage: (msg: WSStageMessage) => void
  setConnected: (v: boolean) => void
  confirmValidation: (approved: boolean) => void   // called by ValidationModal
  loadSession: (session: AuditSession) => void
  reset: () => void
}

const makeSteps = (): AuditStep[] => PIPELINE_STEPS.map(s => ({ ...s, status: 'pending' }))

function addChat(
  state: AuditState, 
  msg: Omit<ChatMessage, 'id' | 'timestamp'>
): Partial<AuditState> {
  const entry: ChatMessage = {
    ...msg, 
    id: `cm-${Date.now()}-${Math.random()}`, 
    timestamp: new Date().toISOString() 
  }
  return { 
    chatMessages: [
      ...state.chatMessages, 
      entry] }
}

function addLog(state: AuditState, level: LiveLogEntry['level'], message: string): Partial<AuditState> {
  const entry: LiveLogEntry = { id: `l-${Date.now()}`, level, message, timestamp: new Date().toISOString() }
  return { liveLog: [...state.liveLog, entry] }
}

/* adding new function */
function updateStageChat(
  messages: ChatMessage[],
  title: string,
  progress: number,
  type: ChatMessageType = 'progress',
  content?: string,
): ChatMessage[] {
  return messages.map(message =>
    message.title === title
      ? {
          ...message,
          type,
          progress,
          content: content ?? message.content,
        }
      : message
  )
}
// function setStepActive(steps: AuditStep[], stepId: string): AuditStep[] {
//   return steps.map(s => {
//     if (s.id === stepId) return { ...s, status: 'active', startedAt: new Date().toISOString() }
//     if (s.status === 'active') return { ...s, status: 'completed', completedAt: new Date().toISOString() }
//     return s
//   })
// }
function setStepActive(steps: AuditStep[], stepId: string): AuditStep[] {
  let foundCurrent = false

  return steps.map(step => {
    if (step.id === stepId) {
      foundCurrent = true
      return {
        ...step,
        status: 'active',
        startedAt: new Date().toISOString(),
      }
    }

    if (!foundCurrent && step.status !== 'completed') {
      return {
        ...step,
        status: 'completed',
        completedAt: new Date().toISOString(),
      }
    }

    return step
  })
}

function setStepDone(steps: AuditStep[], stepId: string): AuditStep[] {
  return steps.map(s =>
    s.id === stepId ? { ...s, status: 'completed', completedAt: new Date().toISOString() } : s
  )
}

export const useAuditStore = create<AuditState>((set, get) => ({
  session: null,
  chatMessages: [],
  liveLog: [],
  isConnected: false,
  pendingValidation: null,
  frameworkCategories: [],

  initSession: (id, name, projectName, clientName, auditType) => {
    set({
      session: {
        id, name, projectName, clientName, auditType,
        status: 'pending',
        steps: makeSteps(),
        documents: [],
        overallProgress: 0,
        createdAt: new Date().toISOString(),
      },
      chatMessages: [],
      liveLog: [],
      pendingValidation: null,
    })
  },
  loadSession: (session) => {
    set(prev => ({
      session,
      chatMessages: prev.chatMessages.length > 0 ? prev.chatMessages : [],
      liveLog: prev.liveLog.length > 0 ? prev.liveLog : [],
      pendingValidation: null,
    }))
  },

  /**
   * handleStage — translates every backend WS stage into store updates.
   *
   * Backend stages (in order):
   *   fetching → project_loaded → identifying → validation_required
   *   → identified → parsing → parsed → auditing → audited
   *   → summarising → summarised → exporting → uploading → done
   *   (error at any point)
   */
  handleStage: (msg) => {
    console.log("================================")
    console.log("Stage received:", msg.stage)

    const { stage, data, identified_docs, message } = msg
    const state = get()

    console.log("Session exists:", !!state.session)
    console.log("Current session:", state.session)

    if (!state.session) {
      console.log("Ignoring stage because session is NULL")
      return
    }


    const stepId = STAGE_TO_STEP[stage]

    switch (stage) {
      case 'fetching':
        set(s => ({
          session: s.session ? { ...s.session, status: 'fetching', steps: setStepActive(s.session.steps, 's1') } : null,
          ...addLog(s as AuditState, 'info', 'Connecting to SharePoint…'),
          ...addChat(s as AuditState, { type: 'status', title: 'Connecting to SharePoint', content: 'Fetching project details from SharePoint list…' }),
        }))
        break

      case 'project_loaded':
        set(s => ({
          session: s.session ? {
            ...s.session,
            status: 'project_loaded',
            projectName: (data?.project_name as string) ?? s.session.projectName,
            auditType: (data?.audit_type as string) ?? s.session.auditType,
            steps: setStepDone(setStepActive(s.session.steps, 's2'), 's1'),
          } : null,
          ...addChat(s as AuditState, {
            type: 'success', title: 'Project Loaded from SharePoint',
            content: `Found project: ${data?.project_name ?? 'Unknown'}`,
            details: [
              `Client: ${data?.client_name ?? '—'}`,
              `Audit type: ${data?.audit_type ?? '—'}`,
              `Documents found: ${data?.document_count ?? '—'}`,
            ],
          }),
          ...addLog(s as AuditState, 'success', `Project loaded: ${data?.project_name}`),
        }))
        break

      // case 'identifying':
      //   set(s => ({
      //     session: s.session ? { ...s.session, status: 'identifying', steps: setStepActive(s.session.steps, 's3') } : null,
      //     ...addLog(s as AuditState, 'info', 'AI identifying and categorising documents…'),
      //     ...addChat(s as AuditState, { type: 'loading', title: 'Identifying Documents', content: 'AI is analysing document names and categorising them against the audit framework…' }),
      //   }))
      //   break

      case 'identifying':
        set(s => ({
          session: s.session
            ? {
                ...s.session,
                status: 'identifying',
                steps: setStepActive(
                  s.session.steps,
                  's3'
                ),
                overallProgress: 20,
              }
            : null,

          ...addChat(s as AuditState, {
            type: 'loading',
            title: 'Identifying Documents',
            content:
              'AI is analysing document names and categorising them against the audit framework…',
            progress: 20,
          }),

          ...addLog(
            s as AuditState,
            'info',
            'AI identifying and categorising documents…'
          ),
        }))
        break


      case 'validation_required':
        set(s => {
          const updatedChats = updateStageChat(
            s.chatMessages,
            'Identifying Documents',
            100,
            'success',
            `AI identified ${identified_docs?.length ?? 0} document(s) successfully.`
          )

          const confirmationMessage: ChatMessage = {
            id: `cm-${Date.now()}-${Math.random()}`,
            timestamp: new Date().toISOString(),
            type: 'confirm',
            title: 'Document Identification — Please Review',
            content: `AI has identified ${identified_docs?.length ?? 0} document(s). Please review the categories below and approve or correct before the audit continues.`,
            identifiedDocs: identified_docs,
          }

          return {
            pendingValidation: identified_docs ?? [],
            frameworkCategories: (msg as any).framework_categories ?? [],

            session: s.session
              ? {
                  ...s.session,
                  overallProgress: 30,
                  steps: s.session.steps.map(step =>
                    step.id === 's3'
                      ? {
                          ...step,
                          status: 'completed' as StepStatus,
                          completedAt:
                            step.completedAt ??
                            new Date().toISOString(),
                        }
                      : step.id === 's4'
                      ? {
                          ...step,
                          status: 'active' as StepStatus,
                          startedAt:
                            step.startedAt ??
                            new Date().toISOString(),
                        }
                      : step
                  ),
                }
              : null,

            chatMessages: [
              ...updatedChats,
              confirmationMessage,
            ],

            liveLog: [
              ...s.liveLog,
              {
                id: `l-${Date.now()}`,
                level: 'warning',
                message: `Validation required — ${identified_docs?.length ?? 0} documents identified`,
                timestamp: new Date().toISOString(),
              },
            ],
          }
        })
        break


      case 'identified':
        set(s => ({
          pendingValidation: null,
          session: s.session
            ? {
                ...s.session,
                status: 'identified',
                steps: s.session.steps.map(step =>
                  ['s3', 's4'].includes(step.id)
                    ? { ...step, status: 'completed' as StepStatus, completedAt: step.completedAt ?? new Date().toISOString() }
                    : step
                ),
              }
            : null,
          ...addLog(s as AuditState, 'success', `${data?.count ?? 0} documents confirmed`),
        }))
        break

      case 'document_update': {
        const upd = data as {
          document_id: string
          filename: string
          status: string
          stage?: string
          progress?: number
        } | undefined

        if (!upd?.document_id) break

        // Map backend status strings to frontend DocumentStatus
        const docStatus: DocumentStatus =
          upd.status === 'auditing' ? 'processing'
          : upd.status === 'parsed' ? 'processing'
          : upd.status === 'completed' ? 'completed'
          : upd.status === 'failed' ? 'failed'
          : 'queued'

        const isNowActive = docStatus === 'processing'
        const isNowDone = docStatus === 'completed' || docStatus === 'failed'

        set(s => {
          if (!s.session) return {}

          const existingIndex = s.session.documents.findIndex(d => d.id === upd.document_id)

          let updatedDocuments: AuditDocument[]

          if (existingIndex >= 0) {
            // Update the existing document in place
            updatedDocuments = s.session.documents.map(d => {
              if (d.id !== upd.document_id) return d
              return {
                ...d,
                status: docStatus,
                progress:
                  upd.status === 'completed' ? 100
                  : upd.status === 'auditing' ? 50
                  : upd.status === 'parsed' ? 30
                  : d.progress,
                startedAt: isNowActive && !d.startedAt ? new Date().toISOString() : d.startedAt,
                completedAt: isNowDone ? new Date().toISOString() : d.completedAt,
              }
            })
          } else {
            // Document not yet in store — add it
            const newDoc: AuditDocument = {
              id: upd.document_id,
              name: upd.filename,
              type: 'document',
              status: docStatus,
              progress: upd.status === 'completed' ? 100 : 0,
              checks: [],
              startedAt: isNowActive ? new Date().toISOString() : undefined,
              completedAt: isNowDone ? new Date().toISOString() : undefined,
            }
            updatedDocuments = [...s.session.documents, newDoc]
          }

          const currentDocumentId = isNowActive
            ? upd.document_id
            : isNowDone && s.session.currentDocumentId === upd.document_id
              ? undefined
              : s.session.currentDocumentId

          return {
            session: {
              ...s.session,
              documents: updatedDocuments,
              currentDocumentId,
            },
          }
        })
        break
      }
      
      case 'documents_validated':
        // Pipeline acknowledged validation — no UI update needed
        break

      case 'heartbeat':
        // Keep-alive ping — no UI update needed
        break

      case 'parsing': {
        set(s => ({
          session: s.session ? {
            ...s.session,
            status: 'parsing',
            steps: setStepActive(
              // Explicitly complete s3 and s4 first so identifying/validation
              // dots are never left active when parsing starts
              setStepDone(setStepDone(s.session.steps, 's3'), 's4'),
              's5'
            ),
          } : null,
          ...addChat(s as AuditState, { type: 'info', title: 'Parsing Documents', content: 'Extracting text, tables, and images from all documents…' }),
          ...addLog(s as AuditState, 'info', 'Parsing documents…'),
        }))
        break
      }


      case 'parsed':
        set(s => ({
          session: s.session ? { 
            ...s.session,
            status: 'parsed',
            steps: setStepDone(s.session.steps, 's5')
          } : null,

          ...addLog(s as AuditState, 'success', `${data?.count ?? 0} documents parsed`),
        }))
        break

      case 'auditing':
        set(s => ({
          session: s.session
            ? {
                ...s.session,
                status: 'auditing',
                steps: setStepActive(s.session.steps, 's6'),
                overallProgress: 45,
                // Per-document status updates come from document_update events
              }
            : null,
          ...addChat(s as AuditState, {
            type: 'progress',
            title: 'AI Evaluation Running',
            content: 'Evaluating each document against the audit framework criteria…',
            progress: 45,
          }),
          ...addLog(s as AuditState, 'info', 'AI evaluation started'),
        }))
        break
      
      // case 'audited': {
      //   set(s => ({
      //     session: s.session ? {
      //       ...s.session,
      //       status: 'audited',
      //       steps: setStepDone(s.session.steps, 's6'),
      //       overallProgress: 65,
      //       currentDocumentId: undefined,
      //       // Documents already updated by document_update events — do not replace array
      //     } : null,
      //     ...addChat(s as AuditState, {
      //       type: 'success',
      //       title: `${data?.count ?? 0} Documents Evaluated`,
      //       content: 'All documents have been audited against the framework criteria.',
      //     }),
      //     ...addLog(s as AuditState, 'success', `${data?.count ?? 0} documents audited`),
      //   }))
      //   break
      // }

      case 'audited': {
        set(s => ({
          session: s.session
            ? {
                ...s.session,
                status: 'audited',
                steps: setStepDone(s.session.steps, 's6'),
                overallProgress: 65,
                currentDocumentId: undefined,
              }
            : null,

          chatMessages: updateStageChat(
            s.chatMessages,
            'AI Evaluation Running',
            100,
            'success',
            'All documents have been audited against the framework criteria.'
          ),

          ...addLog(
            s as AuditState,
            'success',
            `${data?.count ?? 0} documents audited`
          ),
        }))
        break
      }  

      case 'summarising':
        set(s => ({
          session: s.session ? { ...s.session, status: 'summarising', steps: setStepActive(s.session.steps, 's7'), overallProgress: 75 } : null,
          ...addChat(s as AuditState, { type: 'loading', title: 'Generating Summary', content: 'Creating cross-document findings and recommendations…', progress: 75 }),
          ...addLog(s as AuditState, 'info', 'Generating combined summary…'),
        }))
        break

      // case 'summarised':
      //   set(s => ({
      //     session: s.session ? {
      //       ...s.session,
      //       status: 'summarised',
      //       steps: setStepDone(setStepActive(s.session.steps, 's7'), 's7'),
      //       overallProgress: 85,
      //       overallScore: data?.overall_project_score
      //         ? Math.round((data.overall_project_score as number) * 20)
      //         : undefined,
      //     } : null,
      //     ...addLog(s as AuditState, 'success', `Overall score: ${data?.overall_project_score}/5`),
      //   }))
      //   break

      case 'summarised':
        set(s => ({
          session: s.session
            ? {
                ...s.session,
                status: 'summarised',
                steps: setStepDone(
                  setStepActive(
                    s.session.steps,
                    's7'
                  ),
                  's7'
                ),
                overallProgress: 85,
                overallScore:
                  data?.overall_project_score
                    ? Math.round(
                        (data.overall_project_score as number) * 20
                      )
                    : undefined,
              }
            : null,

          chatMessages: updateStageChat(
            s.chatMessages,
            'Generating Summary',
            100,
            'success',
            'Combined audit summary generated successfully.'
          ),

          ...addLog(
            s as AuditState,
            'success',
            `Overall score: ${data?.overall_project_score}/5`
          ),
        }))
        break


      // case 'exporting':
      //   set(s => ({
      //     session: s.session ? { ...s.session, status: 'exporting', steps: setStepActive(s.session.steps, 's8'), overallProgress: 90 } : null,
      //     ...addChat(s as AuditState, { type: 'loading', title: 'Exporting Report', content: 'Creating Excel report with audit results...', progress: 90 }),
      //     ...addLog(s as AuditState, 'info', 'Exporting Excel report…'),
      //   }))
      //   break

      case 'exporting':
        set(s => ({
          session: s.session
            ? {
                ...s.session,
                status: 'exporting',
                steps: setStepActive(
                  s.session.steps,
                  's8'
                ),
                overallProgress: 90,
              }
            : null,

          chatMessages: updateStageChat(
            s.chatMessages,
            'Generating Summary',
            100,
            'success',
            'Combined audit summary generated successfully.'
          ),

          ...addChat(s as AuditState, {
            type: 'loading',
            title: 'Exporting Report',
            content:
              'Creating Excel report with audit results...',
            progress: 90,
          }),

          ...addLog(
            s as AuditState,
            'info',
            'Exporting Excel report…'
          ),
        }))
        break

      // case 'uploading':
      //   set(s => ({
      //     session: s.session ? { ...s.session, status: 'uploading', steps: setStepActive(s.session.steps, 's8'), overallProgress: 95 } : null,
      //     ...addChat(s as AuditState, { type: 'loading', title: 'Uploading Report', content: 'Uploading report to SharePoint...', progress: 95 }),
      //     ...addLog(s as AuditState, 'info', 'Uploading report to SharePoint…'),
      //   }))
      //   break

      case 'uploading':
        set(s => {
          const cleanedMessages = s.chatMessages.filter(
            msg => msg.title !== 'Exporting Report'
          )

          return {
            session: s.session
              ? {
                  ...s.session,
                  status: 'uploading',
                  steps: setStepActive(
                    s.session.steps,
                    's8'
                  ),
                  overallProgress: 95,
                }
              : null,

            chatMessages: [
              ...cleanedMessages,

              {
                id: `cm-${Date.now()}-${Math.random()}`,
                timestamp: new Date().toISOString(),
                type: 'success',
                title: 'Exporting Report',
                content:
                  'Excel audit report created successfully.',
                progress: 100,
              },

              {
                id: `cm-${Date.now()}-${Math.random()}`,
                timestamp: new Date().toISOString(),
                type: 'loading',
                title: 'Uploading Report',
                content:
                  'Uploading report to SharePoint...',
                progress: 95,
              },
            ],

            ...addLog(
              s as AuditState,
              'info',
              'Uploading report to SharePoint…'
            ),
          }
        })
        break
      // case 'done':
      //   set(s => ({
      //     session: s.session ? {
      //       ...s.session,
      //       status: 'done',
      //       overallProgress: 100,
      //       completedAt: new Date().toISOString(),
      //       reportUrl: data?.report_url as string ?? undefined,
      //       reportName: data?.report_name as string ?? undefined,
      //       overallScore: data?.overall_score
      //         ? Math.round((data.overall_score as number) * 20)
      //         : s.session.overallScore,
      //       steps: s.session.steps.map(step => ({
      //         ...step,
      //         status: 'completed' as StepStatus,
      //         completedAt: step.completedAt ?? new Date().toISOString(),
      //       })),
      //     } : null,
      //     ...addChat(s as AuditState, {
      //       type: 'summary', title: '✅ Audit Complete',
      //       content: `Audit finished with an overall score of ${data?.overall_score ? Math.round((data.overall_score as number)*20) : '—'}%.`,
      //       details: [
      //         `Report: ${data?.report_name ?? '—'}`,
      //         `Your audit report is ready. Click the "Export Report" button at the top-right to download the Excel report.`,
      //       ],
      //     }),
      //     ...addLog(s as AuditState, 'success', 'Audit pipeline completed successfully'),
      //   }))
      //   break

      case 'done':
        set(s => ({
          session: s.session
            ? {
                ...s.session,
                status: 'done',
                overallProgress: 100,
                completedAt: new Date().toISOString(),
                reportUrl:
                  data?.report_url as string ??
                  undefined,
                reportName:
                  data?.report_name as string ??
                  undefined,
                overallScore:
                  data?.overall_score
                    ? Math.round(
                        (data.overall_score as number) * 20
                      )
                    : s.session.overallScore,
                steps: s.session.steps.map(step => ({
                  ...step,
                  status:
                    'completed' as StepStatus,
                  completedAt:
                    step.completedAt ??
                    new Date().toISOString(),
                })),
              }
            : null,

          chatMessages: [
            ...updateStageChat(
              s.chatMessages,
              'Uploading Report',
              100,
              'success',
              'Audit report uploaded successfully.'
            ),
            {
              id: `cm-${Date.now()}-${Math.random()}`,
              timestamp:
                new Date().toISOString(),
              type: 'summary',
              title: '✅ Audit Complete',
              content:
                `Audit finished with an overall score of ${
                  data?.overall_score
                    ? Math.round(
                        (data.overall_score as number) * 20
                      )
                    : '—'
                }%.`,
              details: [
                `Report: ${
                  data?.report_name ?? '—'
                }`,
                'Your audit report is ready. Click the "Export Report" button at the top-right to download the Excel report.',
              ],
            },
          ],

          ...addLog(
            s as AuditState,
            'success',
            'Audit pipeline completed successfully'
          ),
        }))
        break

      case 'error': {
                  // The backend sends "Session already done" when a WebSocket tries to
                  // reconnect to a completed session. This is not a real failure —
                  // do not overwrite the correctly loaded DB state.
                  if (message === 'Session already done' || message === 'Session already failed') {
                    console.log("Ignoring stale WS reconnect message:", message)
                    break
                  }

                  set(s => ({
                    session: s.session ? {
                      ...s.session,
                      status: 'failed',
                      steps: s.session.steps.map(st =>
                        st.status === 'active' ? { ...st, status: 'failed' as StepStatus } : st
                      ),
                    } : null,
                    ...addChat(s as AuditState, { type: 'error', title: 'Pipeline Error', content: message ?? 'An unexpected error occurred.' }),
                    ...addLog(s as AuditState, 'error', message ?? 'Pipeline failed'),
                  }))
                  break
                }
    }

  },

  setConnected: (v) => set(s => ({
    isConnected: v,
    ...addLog(s, v ? 'success' : 'warning',
      v ? 'WebSocket connected — live updates active' : 'WebSocket disconnected'),
  })),

  confirmValidation: (approved) => {
    // The hook calls auditWsService.sendValidationAnswer() — this just clears the modal
    set({ pendingValidation: null })
  },

  reset: () => set({ session: null, chatMessages: [], liveLog: [], isConnected: false, pendingValidation: null,frameworkCategories: [] }),
}))

// ─── UI Store ──────────────────────────────────────────────────────────────────
interface UIState {
  sidebarCollapsed: boolean
  notificationPanelOpen: boolean
  startAuditModalOpen: boolean
  toggleSidebar: () => void
  setNotificationPanel: (v: boolean) => void
  setStartAuditModal: (v: boolean) => void
}

export const useUIStore = create<UIState>(set => ({
  sidebarCollapsed: false,
  notificationPanelOpen: false,
  startAuditModalOpen: false,
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setNotificationPanel: (v) => set({ notificationPanelOpen: v }),
  setStartAuditModal: (v) => set({ startAuditModalOpen: v }),
}))
