{#- By default dbt prefixes custom schemas with the target schema ("main_staging").
    Use the custom name as-is so tables live in staging / intermediate / marts. -#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
