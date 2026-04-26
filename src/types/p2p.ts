import type { ResultType } from './api.ts'

export type P2PRole = 'organizer' | 'viewer' | 'referee'

export type P2PConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'host-offline'

export type PageType = 'pairings' | 'standings' | 'refereePairings'

export interface P2PPeer {
  id: string
  role: P2PRole
  connectedAt: number
  label?: string
  verified: boolean
  hostId?: string
}

export type PageUpdateMessage = {
  pageType: PageType
  tournamentId: number
  tournamentName: string
  roundNr: number
  html: string
  timestamp: number
}

export type ResultSubmitMessage = {
  tournamentId: number
  roundNr: number
  boardNr: number
  resultType: ResultType
  resultDisplay?: string
  refereeName: string
  timestamp: number
  expectedPrior?: ResultType
}

export type ResultAckMessage = {
  tournamentId?: number
  boardNr: number
  roundNr: number
  accepted: boolean
  reason?: string
}

export type AuditLogEntry = {
  timestamp: number
  refereeName: string
  boardNr: number
  roundNr: number
  resultType: string
  resultDisplay?: string
  accepted: boolean
  reason?: string
}

export type PeerCountMessage = {
  total: number
  viewers: number
  referees: number
  chatEnabled?: boolean
  clubFilterEnabled?: boolean
}

export type AnnouncementMessage = {
  text: string
  timestamp: number
}

export type ChatMessage = {
  id: string
  senderName: string
  senderRole: P2PRole
  text: string
  timestamp: number
  isSystem?: boolean
}

export type ChatDeleteMessage = {
  id: string
}

export type PeerKickMessage = {
  reason?: string
}

export type SharedTournamentsMessage = {
  tournamentIds: number[]
  includeFutureTournaments: boolean
  timestamp: number
}

export type ViewerSelectTournamentMessage = {
  tournamentId: number
}

export type RoundManifestMessage = {
  tournamentId: number
  roundNrs: number[]
  timestamp: number
}
