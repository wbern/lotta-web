import type {
  Chess4StandingDto,
  ClubDto,
  ClubStandingDto,
  CreateTournamentRequest,
  GameDto,
  PlayerDto,
  RoundDto,
  SetResultRequest,
  SettingsDto,
  StandingDto,
  TournamentDto,
  TournamentListItemDto,
} from '../types/api'
import type { CommandOutcome, SetResultCommand } from './result-command'

export interface DataProvider {
  tournaments: {
    list(): Promise<TournamentListItemDto[]>
    get(id: number): Promise<TournamentDto>
    create(req: CreateTournamentRequest): Promise<TournamentDto>
    update(id: number, req: CreateTournamentRequest): Promise<TournamentDto>
    delete(id: number): Promise<void>
  }
  tournamentPlayers: {
    list(tournamentId: number): Promise<PlayerDto[]>
    add(tournamentId: number, dto: Partial<PlayerDto>): Promise<PlayerDto>
    addMany(tournamentId: number, dtos: Partial<PlayerDto>[]): Promise<PlayerDto[]>
    update(tournamentId: number, playerId: number, dto: Partial<PlayerDto>): Promise<PlayerDto>
    remove(tournamentId: number, playerId: number): Promise<void>
    removeMany(tournamentId: number, playerIds: number[]): Promise<void>
  }
  rounds: {
    list(tournamentId: number): Promise<RoundDto[]>
    get(tournamentId: number, roundNr: number): Promise<RoundDto>
    pairNext(tournamentId: number): Promise<RoundDto>
    unpairLast(tournamentId: number): Promise<void>
  }
  results: {
    set(
      tournamentId: number,
      roundNr: number,
      boardNr: number,
      req: SetResultRequest,
    ): Promise<GameDto>
    addGame(
      tournamentId: number,
      roundNr: number,
      whitePlayerId: number | null,
      blackPlayerId: number | null,
    ): Promise<void>
    updateGame(
      tournamentId: number,
      roundNr: number,
      boardNr: number,
      whitePlayerId: number | null,
      blackPlayerId: number | null,
    ): Promise<void>
    deleteGame(tournamentId: number, roundNr: number, boardNr: number): Promise<void>
    deleteGames(tournamentId: number, roundNr: number, boardNrs: number[]): Promise<void>
  }
  standings: {
    get(tournamentId: number, round?: number): Promise<StandingDto[]>
    getClub(tournamentId: number, round?: number): Promise<ClubStandingDto[]>
    getChess4(tournamentId: number, round?: number): Promise<Chess4StandingDto[]>
  }
  clubs: {
    list(): Promise<ClubDto[]>
    add(dto: Partial<ClubDto>): Promise<ClubDto>
    rename(id: number, dto: Partial<ClubDto>): Promise<ClubDto>
    delete(id: number): Promise<void>
  }
  settings: {
    get(): Promise<SettingsDto>
    update(dto: Partial<SettingsDto>): Promise<SettingsDto>
  }
  poolPlayers: {
    list(): Promise<PlayerDto[]>
    add(dto: Partial<PlayerDto>): Promise<PlayerDto>
    update(id: number, dto: Partial<PlayerDto>): Promise<PlayerDto>
    delete(id: number): Promise<void>
    deleteMany(ids: number[]): Promise<void>
  }
  undo: {
    perform(): Promise<boolean>
    redo(): Promise<boolean>
    restoreToPoint(snapshotIndex: number): Promise<boolean>
  }
  commands?: {
    setResult(cmd: SetResultCommand): Promise<CommandOutcome>
  }
}

export interface DataProviderSetup {
  provider: DataProvider
  teardown: () => Promise<void>
}
