{{ config(tags=['scored']) }}

{#-
    fct_fourth_down_decisions: every regulation 4th-down decision, graded.

    The decision engine (python -m models.score) writes the win probability of each option; this
    model picks the best one and measures what the coach's actual choice cost. Tagged `scored`:
    it builds after scoring, in dbt's second pass (see the Makefile).

    is_graded: the final 30 seconds of a half are kept but not graded. There, clock management
    dominates and the engine's average clock-runoff assumptions break down (e.g. it can't tell
    a 7-second conversion from a 14-second one). That's 3.8% of decisions and 4.3% of WP lost.
-#}

with decisions as (

    select * from {{ ref('fct_fourth_downs') }}

),

options as (

    select * exclude (scored_at) from {{ source('ml', 'fourth_down_options') }}

),

graded as (

    select
        d.*,
        o.* exclude (play_uid),
        greatest(o.wp_go, o.wp_punt, o.wp_fg)                                          as best_wp,
        case d.decision
            when 'go' then o.wp_go
            when 'punt' then o.wp_punt
            when 'field_goal' then o.wp_fg
        end                                                                            as actual_wp,
        -- middle value of the three = the second-best option
        o.wp_go + o.wp_punt + o.wp_fg
            - greatest(o.wp_go, o.wp_punt, o.wp_fg) - least(o.wp_go, o.wp_punt, o.wp_fg) as second_best_wp
    from decisions d
    inner join options o using (play_uid)

)

select
    *,
    case best_wp
        when wp_go then 'go'
        when wp_fg then 'field_goal'
        else 'punt'
    end                                                     as recommendation,
    best_wp - actual_wp                                     as wp_lost,
    best_wp - second_best_wp                                as recommendation_margin,  -- how clear-cut the call is
    wp_go - greatest(wp_punt, wp_fg)                        as go_advantage,           -- > 0 means the model says go
    half_seconds_remaining >= 30                            as is_graded
from graded
