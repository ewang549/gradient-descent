{#-
    fct_fourth_downs: one row per 4th-down DECISION, meaning what the coach actually chose.

    A decision needs a snap. Excluded on purpose:
      * pre-snap penalties (false start, delay of game...): no snap; the replayed 4th down is
        its own row and carries the real decision
      * QB kneels / spikes: clock management, not a go-or-kick choice
    Kept, and labelled by what the coach chose:
      * punts / FGs wiped out by a penalty (the kick happened; only nflverse's text shows it)
      * fakes out of punt/FG formation -> 'go' (is_fake_kick)
      * botched snaps/holds out of kick formation -> the kick the coach chose
      * plays wiped out by a penalty where the offense still ran its play -> 'go'
-#}

with fourth_downs as (

    select
        *,
        case
            when play_description ilike '%(punt formation)%' then 'punt'
            when play_description ilike '%(field goal formation)%' then 'field_goal'
        end as kick_formation
    from {{ ref('fct_plays') }}
    where down = 4

),

classified as (

    select
        *,
        case
            when play_type = 'punt' then 'punt'
            when play_type = 'field_goal' then 'field_goal'
            when play_type = 'no_play' and play_description ilike '% punts %' then 'punt'
            when play_type = 'no_play' and play_description ilike '%field goal is%' then 'field_goal'
            when play_type in ('pass', 'run') and is_aborted and kick_formation is not null then kick_formation
            when play_type in ('pass', 'run') then 'go'
            -- nflverse's pass/rush flags come from the play text, so they only fire if a snap happened
            when play_type = 'no_play' and (is_pass or is_rush) then 'go'
        end as decision
    from fourth_downs

)

select
    -- keys
    play_uid,
    game_id,
    play_id,
    play_seq,
    season,
    week,
    season_type,
    game_type,
    game_date,
    posteam,
    defteam,
    posteam_coach,
    defteam_coach,

    -- the situation (pre-snap)
    is_posteam_home,
    is_neutral_site,
    qtr,
    clock,
    game_seconds_remaining,
    half_seconds_remaining,
    elapsed_share,
    is_overtime,
    yardline_100,
    yardline_label,
    ydstogo,
    is_goal_to_go,
    posteam_score,
    defteam_score,
    score_differential,
    posteam_timeouts_remaining,
    defteam_timeouts_remaining,
    is_receiving_2h_kickoff,
    posteam_spread_line,
    total_line,
    spread_time,
    diff_time_ratio,
    roof,
    is_indoors,
    surface_type,
    temp_f,
    wind_mph,
    posteam_off_epa_last_8,
    posteam_def_epa_last_8,
    defteam_off_epa_last_8,
    defteam_def_epa_last_8,
    posteam_off_epa_season,
    defteam_def_epa_season,

    -- the decision
    decision,
    decision = 'go'                                            as is_go,
    decision = 'go' and kick_formation is not null             as is_fake_kick,
    play_type = 'no_play'                                      as is_nullified_by_penalty,
    play_type,
    play_description,

    -- what happened (post-snap)
    -- converted = the offense earned a new set of downs or scored its own TD, and kept the ball.
    -- (nflverse's fourth_down_converted misses first downs earned via defensive penalty.)
    case when decision = 'go' then
        (is_first_down or (is_touchdown and td_team = posteam))
        and not (is_interception or is_fumble_lost)
    end                                                        as is_converted,
    case when decision = 'field_goal' and play_type = 'field_goal'
        then field_goal_result = 'made'
    end                                                        as is_fg_made,
    if(decision = 'field_goal', kick_distance, null)           as fg_distance,
    yards_gained,
    epa,
    nflverse_wp,
    nflverse_wpa,
    posteam_final_margin,
    posteam_game_result

from classified
where decision is not null
