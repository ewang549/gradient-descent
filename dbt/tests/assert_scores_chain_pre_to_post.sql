-- Leakage guard for the score: each play's PRE-snap score must equal the previous play's
-- POST-play score. If a post-play score (e.g. nflverse's total_home_score) ever replaces the
-- pre-snap one, every scoring play breaks the chain. A handful of upstream scoring corrections
-- are tolerated; more than that fails the build.
{{ config(warn_if='>0', error_if='>100') }}

with scores as (

    select
        game_id,
        play_seq,
        play_uid,
        if(is_posteam_home, posteam_score, defteam_score) as home_score_pre,
        if(is_posteam_home, defteam_score, posteam_score) as away_score_pre,
        lag(home_score_post) over game_order                as prev_home_score_post,
        lag(away_score_post) over game_order                as prev_away_score_post
    from {{ ref('fct_plays') }}
    window game_order as (partition by game_id order by play_seq)

)

select *
from scores
where prev_home_score_post is not null
  and (home_score_pre <> prev_home_score_post or away_score_pre <> prev_away_score_post)
