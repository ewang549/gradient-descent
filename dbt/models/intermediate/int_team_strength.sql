{#-
    int_team_strength: PRE-GAME team strength for every team-game, as rolling EPA per play.

    Leakage guard: every window frame ends at `1 preceding`, so a game's own plays (and any later
    game) can never feed its features. tests/assert_team_strength_uses_only_prior_games.sql checks
    this on every build.

    Ratios are sum(EPA) / sum(plays) over the window, i.e. play-weighted, not an average of
    per-game averages. Teams are partitioned by current franchise abbreviation, so OAK -> LV etc.
    keep their history across relocations.
-#}

with team_games as (

    select * from {{ ref('int_team_game_epa') }}

)

select
    team_game_uid,
    game_id,
    team,
    season,
    week,
    game_date,

    -- last 8 games, crossing season boundaries (so week 1 still has a signal)
    count(*) over last_8                                                                  as games_in_last_8,
    max(game_date) over last_8                                                            as last_8_window_end_date,
    sum(off_epa) over last_8 / nullif(sum(off_plays) over last_8, 0)                      as off_epa_per_play_last_8,
    sum(def_epa) over last_8 / nullif(sum(def_plays) over last_8, 0)                      as def_epa_per_play_last_8,
    sum(off_successes) over last_8 / nullif(sum(off_plays) over last_8, 0)                as off_success_rate_last_8,
    sum(def_successes_allowed) over last_8 / nullif(sum(def_plays) over last_8, 0)        as def_success_rate_last_8,
    sum(off_pass_epa) over last_8 / nullif(sum(off_pass_plays) over last_8, 0)            as off_pass_epa_per_play_last_8,
    sum(off_rush_epa) over last_8 / nullif(sum(off_rush_plays) over last_8, 0)            as off_rush_epa_per_play_last_8,

    -- this season only (null in a team's first game of each season, by design)
    count(*) over season_to_date                                                          as games_season_to_date,
    sum(off_epa) over season_to_date / nullif(sum(off_plays) over season_to_date, 0)      as off_epa_per_play_season,
    sum(def_epa) over season_to_date / nullif(sum(def_plays) over season_to_date, 0)      as def_epa_per_play_season

from team_games
window
    last_8 as (
        partition by team
        order by game_date, game_id
        rows between 8 preceding and 1 preceding
    ),
    season_to_date as (
        partition by team, season
        order by game_date, game_id
        rows between unbounded preceding and 1 preceding
    )
