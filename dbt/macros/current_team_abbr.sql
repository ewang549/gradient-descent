{#- nflverse play-by-play uses each franchise's CURRENT abbreviation in every season (LV, LAC, LA),
    but schedules and rosters keep the historical one (OAK, SD, STL). Normalizing to the pbp
    convention keeps team joins from silently dropping relocated-franchise games. -#}
{% macro current_team_abbr(column) -%}
    case {{ column }}
        when 'OAK' then 'LV'
        when 'SD' then 'LAC'
        when 'STL' then 'LA'
        else {{ column }}
    end
{%- endmacro %}
