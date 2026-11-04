-- stg_schedules: one row per game, 1999-present, including upcoming games (is_final = false).
-- The source of truth for game-level facts: final score, closing Vegas line, coaches, venue.

select
    game_id,
    season,
    game_type,
    if(game_type = 'REG', 'REG', 'POST')                       as season_type,
    week,
    cast(gameday as date)                                      as game_date,
    weekday,
    gametime                                                   as kickoff_time_et,

    {{ current_team_abbr('home_team') }}                       as home_team,
    {{ current_team_abbr('away_team') }}                       as away_team,
    home_team                                                  as home_team_historical,
    away_team                                                  as away_team_historical,

    home_score,
    away_score,
    result                                                     as home_margin,  -- home_score - away_score
    result is not null                                         as is_final,
    coalesce(overtime, 0) = 1                                  as is_overtime,
    location = 'Neutral'                                       as is_neutral_site,

    -- closing line, set before kickoff. Positive spread_line = HOME team favored (verified:
    -- corr(spread_line, home_margin) = +0.43; home favorites of 7+ win by 10.7 on average)
    spread_line,
    total_line,
    home_moneyline,
    away_moneyline,

    coalesce(div_game, 0) = 1                                  as is_division_game,
    home_rest,
    away_rest,

    -- venue & weather (temp/wind are null indoors)
    roof,
    roof in ('dome', 'closed')                                 as is_indoors,
    case
        when nullif(trim(surface), '') is null then null
        when trim(surface) in ('grass', 'dessograss') then 'grass'  -- dessograss = reinforced natural grass
        else 'turf'
    end                                                        as surface_type,
    temp                                                       as temp_f,
    wind                                                       as wind_mph,
    stadium_id,
    stadium,

    -- people
    home_coach,
    away_coach,
    home_qb_id,
    away_qb_id,
    home_qb_name,
    away_qb_name,
    referee

from {{ source('raw', 'schedules') }}
