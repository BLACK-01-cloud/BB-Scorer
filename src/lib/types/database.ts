// Hand-written types matching supabase/migrations/0001_initial_schema.sql.
// Replace with generated types via `supabase gen types typescript --project-id …`.

export type MatchType = "league" | "quarter_final" | "semi_final" | "final";
export type MatchStatus =
  | "scheduled"
  | "live"
  | "paused"
  | "completed"
  | "cancelled";
export type EntityStatus = "active" | "inactive" | "archived";

export type UserRole = "admin" | "scorer";
export type UserStatus = "active" | "inactive";

export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface Season {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  short_name: string;
  logo_url: string | null;
  status: EntityStatus;
  created_at: string;
}

export interface Player {
  id: string;
  full_name: string;
  display_name: string | null;
  photo_url: string | null;
  position: string | null;
  status: EntityStatus;
  created_at: string;
}

export interface TeamPlayer {
  id: string;
  season_id: string;
  team_id: string;
  player_id: string;
  jersey_number: string | null;
  active: boolean;
  created_at: string;
}

export interface Match {
  id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  match_type: MatchType;
  match_status: MatchStatus;
  match_date: string;
  venue: string | null;
  current_period: number;
  period_duration_seconds: number;
  time_remaining_seconds: number;
  shot_clock_seconds: number;
  shot_clock_running: boolean;
  timer_running: boolean;
  home_score: number;
  away_score: number;
  home_team_fouls: number;
  away_team_fouls: number;
  created_at: string;
  updated_at: string;
}

export interface MatchPlayerStat {
  id: string;
  match_id: string;
  team_id: string;
  player_id: string;
  points: number;
  pts_1: number;
  pts_2: number;
  pts_3: number;
  fouls: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScoreCorrection {
  id: string;
  match_id: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AppSettings {
  id: string;
  singleton: boolean;
  site_name: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

// Permissive Insert/Update — Postgres defaults handle most non-supplied columns.
type Insert<T> = Partial<T>;
type Update<T> = Partial<T>;
type Tbl<T> = { Row: T; Insert: Insert<T>; Update: Update<T>; Relationships: [] };

export interface Database {
  // Required by @supabase/supabase-js v2.46+ to avoid row types collapsing
  // to `never`. Bump the string when you regenerate types from the project.
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      seasons: Tbl<Season>;
      teams: Tbl<Team>;
      players: Tbl<Player>;
      team_players: Tbl<TeamPlayer>;
      matches: Tbl<Match>;
      match_player_stats: Tbl<MatchPlayerStat>;
      score_corrections: Tbl<ScoreCorrection>;
      users: Tbl<User>;
      app_settings: Tbl<AppSettings>;
    };
    // Empty object literal — `Record<string, never>` would fail the
    // GenericView constraint and collapse the whole schema to `never`.
    Views: {};
    Functions: {
      add_player_points: {
        Args: {
          p_match_id: string;
          p_team_id: string;
          p_player_id: string;
          p_delta: number;
        };
        Returns: void;
      };
      record_player_made_shot: {
        Args: {
          p_match_id: string;
          p_team_id: string;
          p_player_id: string;
          p_point_value: number;
        };
        Returns: void;
      };
      add_team_points: {
        Args: { p_match_id: string; p_team_id: string; p_delta: number };
        Returns: void;
      };
      add_player_foul: {
        Args: {
          p_match_id: string;
          p_team_id: string;
          p_player_id: string;
          p_delta: number;
        };
        Returns: void;
      };
      add_team_foul: {
        Args: { p_match_id: string; p_team_id: string; p_delta: number };
        Returns: void;
      };
      substitute_player: {
        Args: {
          p_match_id: string;
          p_team_id: string;
          p_out_player_id: string;
          p_in_player_id: string;
        };
        Returns: void;
      };
      seed_match_roster: {
        Args: { p_match_id: string };
        Returns: void;
      };
      get_login_email_by_username: {
        Args: { input_username: string };
        Returns: string | null;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {};
  };
}
