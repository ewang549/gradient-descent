-- int_team_game_epa: one row per team per played game, with offensive and defensive EPA TOTALS.
-- Totals (not averages) so rolling windows downstream can weight every play equally.

with plays as (

    select game_id, posteam, defteam, epa, is_success, is_pass, is_rush
    from {{ ref('stg_pbp') }}
    where (is_pass or is_rush)   -- the standard "EPA per play" set: dropbacks + runs, incl. plays wiped out by penalty
      and down is not null       -- excludes two-point tries
      and epa is not null

),

offense as (

    select
        game_id,
        posteam                                         as team,
        count(*)                                        as off_plays,
        sum(epa)                                        as off_epa,
        count(*) filter (where is_success)              as off_successes,
        count(*) filter (where is_pass)                 as off_pass_plays,
        coalesce(sum(epa) filter (where is_pass), 0)    as off_pass_epa,
        count(*) filter (where is_rush)                 as off_rush_plays,
        coalesce(sum(epa) filter (where is_rush), 0)    as off_rush_epa
    from plays
    group by all

),

defense as (

    select
        game_id,
        defteam                                         as team,
        count(*)                                        as def_plays,
        sum(epa)                                        as def_epa,  -- EPA allowed: lower is better
        count(*) filter (where is_success)              as def_successes_allowed
    from plays
    group by all

),

final_games as (

    select * from {{ ref('stg_schedules') }} where is_final

),

team_games as (

    select game_id, season, week, game_date, home_team as team, away_team as opponent, true as is_home
    from final_games
    union all
    select game_id, season, week, game_date, away_team, home_team, false
    from final_games

)

select
    tg.game_id || '_' || tg.team                        as team_game_uid,
    tg.game_id,
    tg.season,
    tg.week,
    tg.game_date,
    tg.team,
    tg.opponent,
    tg.is_home,
    o.off_plays,
    o.off_epa,
    o.off_successes,
    o.off_pass_plays,
    o.off_pass_epa,
    o.off_rush_plays,
    o.off_rush_epa,
    d.def_plays,
    d.def_epa,
    d.def_successes_allowed

from team_games tg
-- inner joins: only games that actually have play-by-play (3 old games are missing upstream)
inner join offense o on o.game_id = tg.game_id and o.team = tg.team
inner join defense d on d.game_id = tg.game_id and d.team = tg.team
