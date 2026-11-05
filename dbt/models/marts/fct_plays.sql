{#-
    fct_plays: one row per real play, with the pre-snap game state the win-probability and
    decision models use. Columns come in four groups, in this order:
      1. game state ...... known before the snap         -> safe model features
      2. team strength ... known before kickoff           -> safe model features
      3. play & result ... what happened on this play     -> NEVER features (post-snap)
      4. game outcome .... the final result               -> the WP label, NEVER a feature
-#}

with plays as (

    select * from {{ ref('stg_pbp') }}

),

games as (

    select * from {{ ref('stg_schedules') }}

),

strength as (

    select * from {{ ref('int_team_strength') }}

),

opening_possession as (

    -- The team with the first possession received the opening kickoff, so the OTHER team
    -- receives the second-half kickoff. Derived from the plays because nflverse's own
    -- home_opening_kickoff flag contradicts the play descriptions in ~2% of games.
    select game_id, arg_min(posteam, play_seq) as opening_receiving_team
    from plays
    where qtr = 1
    group by game_id

),

state as (

    select
        p.*,
        g.game_type,
        g.is_neutral_site,
        g.roof,
        g.is_indoors,
        g.surface_type,
        g.temp_f,
        g.wind_mph,
        g.total_line,
        if(p.is_posteam_home, g.home_coach, g.away_coach)              as posteam_coach,
        if(p.is_posteam_home, g.away_coach, g.home_coach)              as defteam_coach,
        if(p.is_posteam_home, g.spread_line, -g.spread_line)           as posteam_spread_line,
        if(p.is_posteam_home, g.home_margin, -g.home_margin)           as posteam_final_margin,
        coalesce(p.qtr <= 2 and p.posteam <> o.opening_receiving_team, false) as is_receiving_2h_kickoff,
        -- share of regulation elapsed; overtime is treated as "regulation fully elapsed"
        if(p.is_overtime, 1.0, (3600 - p.game_seconds_remaining) / 3600.0) as elapsed_share
    from plays p
    left join games g using (game_id)
    left join opening_possession o using (game_id)

)

select
    -- keys
    s.play_uid,
    s.game_id,
    s.play_id,
    s.play_seq,
    s.season,
    s.week,
    s.season_type,
    s.game_type,
    s.game_date,
    s.posteam,
    s.defteam,
    s.home_team,
    s.away_team,
    s.posteam_coach,
    s.defteam_coach,

    -- 1. game state: known before the snap ------------------------------------------------
    s.is_posteam_home,
    s.is_neutral_site,
    s.qtr,
    s.game_half,
    s.is_overtime,
    s.clock,
    s.quarter_seconds_remaining,
    s.half_seconds_remaining,
    s.game_seconds_remaining,
    s.elapsed_share,
    s.down,
    s.ydstogo,
    s.yardline_100,
    s.yardline_label,
    s.is_goal_to_go,
    s.posteam_score,
    s.defteam_score,
    s.score_differential,
    s.posteam_timeouts_remaining,
    s.defteam_timeouts_remaining,
    s.is_receiving_2h_kickoff,
    s.posteam_spread_line,                                         -- closing line, + = posteam favored
    s.total_line,
    -- nflfastR-style interactions: the spread's information fades as the game goes on,
    -- while a lead matters more the less time is left
    s.posteam_spread_line * exp(-4 * s.elapsed_share)              as spread_time,
    s.score_differential / exp(-4 * s.elapsed_share)               as diff_time_ratio,
    s.roof,
    s.is_indoors,
    s.surface_type,
    s.temp_f,
    s.wind_mph,

    -- 2. team strength: known before kickoff (rolling, prior games only) ------------------
    po.off_epa_per_play_last_8                                     as posteam_off_epa_last_8,
    po.def_epa_per_play_last_8                                     as posteam_def_epa_last_8,
    dt.off_epa_per_play_last_8                                     as defteam_off_epa_last_8,
    dt.def_epa_per_play_last_8                                     as defteam_def_epa_last_8,
    po.off_epa_per_play_season                                     as posteam_off_epa_season,
    po.def_epa_per_play_season                                     as posteam_def_epa_season,
    dt.off_epa_per_play_season                                     as defteam_off_epa_season,
    dt.def_epa_per_play_season                                     as defteam_def_epa_season,

    -- 3. the play and its result: post-snap, never features -------------------------------
    s.play_type,
    s.is_play_type_inferred,
    s.play_description,
    s.is_pass,
    s.is_rush,
    s.is_special_teams,
    s.is_qb_kneel,
    s.is_qb_spike,
    s.is_two_point_attempt,
    s.is_aborted,
    s.is_shotgun,
    s.is_no_huddle,
    s.is_penalty,
    s.penalty_team,
    s.penalty_type,
    s.penalty_yards,
    s.yards_gained,
    s.is_first_down,
    s.is_touchdown,
    s.td_team,
    s.is_interception,
    s.is_fumble_lost,
    s.is_safety,
    s.field_goal_result,
    s.extra_point_result,
    s.two_point_conv_result,
    s.kick_distance,
    s.return_yards,
    s.is_punt_blocked,
    s.is_touchback,
    s.home_score_post,
    s.away_score_post,
    s.score_differential_post,
    s.epa,
    s.is_success,
    s.is_qb_dropback,
    s.is_qb_scramble,
    s.is_sack,
    s.is_pass_attempt,
    s.air_yards,
    s.cpoe,
    s.passer_player_id,
    s.passer_player_name,
    s.drive_number,
    s.drive_result,
    -- nflverse model outputs, kept as Phase 2 benchmarks
    s.nflverse_ep,
    s.nflverse_wp,
    s.nflverse_vegas_wp,
    s.nflverse_wpa,
    s.nflverse_xpass,  -- nflverse's pass-probability model (fit on every season)

    -- 4. game outcome: the WP label, never a feature ----------------------------------------
    s.posteam_final_margin,
    case sign(s.posteam_final_margin)
        when 1 then 'win'
        when -1 then 'loss'
        when 0 then 'tie'
    end                                                            as posteam_game_result

from state s
left join strength po on po.game_id = s.game_id and po.team = s.posteam
left join strength dt on dt.game_id = s.game_id and dt.team = s.defteam
