-- Ingest completeness: every final game has play-by-play, except the games nflverse itself
-- lacks (recorded by the ingest). Warn rather than fail: a game finishing hours before the
-- weekly run may not be published upstream yet.
{{ config(severity='warn') }}

select g.game_id, g.season, g.week
from {{ ref('stg_schedules') }} g
where g.is_final
  and g.game_id not in (select distinct game_id from {{ ref('stg_pbp') }})
  and g.game_id not in (select game_id from {{ source('raw', 'pbp_unavailable_games') }})
