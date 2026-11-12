
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "calendar_events": {
                  Row: {
                    "all_day": boolean,"description": string | null,"end_date": string | null,"ends_at": string | null,"id": string,"location": string | null,"source_id": string,"start_date": string | null,"starts_at": string | null,"title": string,"uid": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_day": boolean,"description"?: string | null,"end_date"?: string | null,"ends_at"?: string | null,"id"?: string,"location"?: string | null,"source_id": string,"start_date"?: string | null,"starts_at"?: string | null,"title": string,"uid": string
                  }
                  Update: {
                    "all_day"?: boolean,"description"?: string | null,"end_date"?: string | null,"ends_at"?: string | null,"id"?: string,"location"?: string | null,"source_id"?: string,"start_date"?: string | null,"starts_at"?: string | null,"title"?: string,"uid"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_events_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "calendar_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"calendar_source_credentials": {
                  Row: {
                    "ical_url": string | null,"source_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ical_url"?: string | null,"source_id": string,"updated_at"?: string
                  }
                  Update: {
                    "ical_url"?: string | null,"source_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_source_credentials_source_id_fkey"
      columns: ["source_id"]
isOneToOne: true
      referencedRelation: "calendar_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"calendar_sources": {
                  Row: {
                    "created_at": string,"id": string,"last_error": string | null,"last_synced_at": string | null,"name": string,"owner_id": string,"provider": string,"sync_started_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_error"?: string | null,"last_synced_at"?: string | null,"name": string,"owner_id"?: string,"provider": string,"sync_started_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_error"?: string | null,"last_synced_at"?: string | null,"name"?: string,"owner_id"?: string,"provider"?: string,"sync_started_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_sources_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"cooking_progress": {
                  Row: {
                    "ingredients": (number)[],"people": number | null,"recipe_id": string,"steps": (number)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ingredients"?: (number)[],"people"?: number | null,"recipe_id": string,"steps"?: (number)[],"updated_at"?: string
                  }
                  Update: {
                    "ingredients"?: (number)[],"people"?: number | null,"recipe_id"?: string,"steps"?: (number)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cooking_progress_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: true
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"food_consumptions": {
                  Row: {
                    "consumed_on": string,"created_at": string,"created_by": string | null,"id": string,"item_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consumed_on": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id": string
                  }
                  Update: {
                    "consumed_on"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "food_consumptions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "food_consumptions_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "food_period_items"
      referencedColumns: ["id"]
    }
                  ]
                },"food_period_items": {
                  Row: {
                    "allowed_occurrences": number,"category": string,"id": string,"meal": Database["public"]['Enums']["food_meal"],"name": string,"period_id": string,"position": number,"quantity": number | null,"unit": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed_occurrences": number,"category": string,"id"?: string,"meal": Database["public"]['Enums']["food_meal"],"name": string,"period_id": string,"position"?: number,"quantity"?: number | null,"unit"?: string | null
                  }
                  Update: {
                    "allowed_occurrences"?: number,"category"?: string,"id"?: string,"meal"?: Database["public"]['Enums']["food_meal"],"name"?: string,"period_id"?: string,"position"?: number,"quantity"?: number | null,"unit"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "food_period_items_period_id_fkey"
      columns: ["period_id"]
isOneToOne: false
      referencedRelation: "food_periods"
      referencedColumns: ["id"]
    }
                  ]
                },"food_periods": {
                  Row: {
                    "created_at": string,"end_date": string,"id": string,"profile_id": string,"start_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"end_date": string,"id"?: string,"profile_id": string,"start_date": string
                  }
                  Update: {
                    "created_at"?: string,"end_date"?: string,"id"?: string,"profile_id"?: string,"start_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "food_periods_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"food_plan_items": {
                  Row: {
                    "allowed_occurrences": number,"category": string,"created_at": string,"id": string,"meal": Database["public"]['Enums']["food_meal"],"name": string,"position": number,"profile_id": string,"quantity": number | null,"unit": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed_occurrences": number,"category": string,"created_at"?: string,"id"?: string,"meal": Database["public"]['Enums']["food_meal"],"name": string,"position"?: number,"profile_id": string,"quantity"?: number | null,"unit"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "allowed_occurrences"?: number,"category"?: string,"created_at"?: string,"id"?: string,"meal"?: Database["public"]['Enums']["food_meal"],"name"?: string,"position"?: number,"profile_id"?: string,"quantity"?: number | null,"unit"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "food_plan_items_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"knit_charts": {
                  Row: {
                    "created_at": string,"flat": boolean,"grid_bottom": number,"grid_top": number,"id": string,"image_path": string,"odd_only": boolean,"project_id": string,"repeats": boolean,"rows": number,"start_row": number,"step_id": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"flat"?: boolean,"grid_bottom": number,"grid_top": number,"id"?: string,"image_path": string,"odd_only"?: boolean,"project_id": string,"repeats"?: boolean,"rows": number,"start_row"?: number,"step_id"?: string | null,"title"?: string
                  }
                  Update: {
                    "created_at"?: string,"flat"?: boolean,"grid_bottom"?: number,"grid_top"?: number,"id"?: string,"image_path"?: string,"odd_only"?: boolean,"project_id"?: string,"repeats"?: boolean,"rows"?: number,"start_row"?: number,"step_id"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "knit_charts_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "knit_projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "knit_charts_step_id_fkey"
      columns: ["step_id"]
isOneToOne: false
      referencedRelation: "knit_steps"
      referencedColumns: ["id"]
    }
                  ]
                },"knit_glossary": {
                  Row: {
                    "abbr": string,"lang": string,"meaning": string
                  }
                  ComputedFields: never
                  Insert: {
                    "abbr": string,"lang": string,"meaning": string
                  }
                  Update: {
                    "abbr"?: string,"lang"?: string,"meaning"?: string
                  }
                  Relationships: [
                    
                  ]
                },"knit_measures": {
                  Row: {
                    "arm": number | null,"chest": number | null,"created_at": string,"head": number | null,"hip": number | null,"id": string,"name": string,"profile_id": string,"updated_at": string,"waist": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "arm"?: number | null,"chest"?: number | null,"created_at"?: string,"head"?: number | null,"hip"?: number | null,"id"?: string,"name": string,"profile_id"?: string,"updated_at"?: string,"waist"?: number | null
                  }
                  Update: {
                    "arm"?: number | null,"chest"?: number | null,"created_at"?: string,"head"?: number | null,"hip"?: number | null,"id"?: string,"name"?: string,"profile_id"?: string,"updated_at"?: string,"waist"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "knit_measures_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"knit_progress_photos": {
                  Row: {
                    "caption": string,"id": string,"project_id": string,"step_id": string | null,"storage_path": string,"taken_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string,"id"?: string,"project_id": string,"step_id"?: string | null,"storage_path": string,"taken_at"?: string
                  }
                  Update: {
                    "caption"?: string,"id"?: string,"project_id"?: string,"step_id"?: string | null,"storage_path"?: string,"taken_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "knit_progress_photos_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "knit_projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "knit_progress_photos_step_id_fkey"
      columns: ["step_id"]
isOneToOne: false
      referencedRelation: "knit_steps"
      referencedColumns: ["id"]
    }
                  ]
                },"knit_projects": {
                  Row: {
                    "abbreviations": NonNullable<Json>,"adaptation": Json | null,"chart_hints": NonNullable<Json>,"created_at": string,"id": string,"my_gauge_rows": number | null,"my_gauge_stitches": number | null,"notes": string,"pattern_gauge_rows": number | null,"pattern_gauge_stitches": number | null,"pdf_path": string | null,"profile_id": string,"size": string,"size_index": number | null,"sizes": (string)[],"title": string,"updated_at": string,"yarn_checks": NonNullable<Json>,"yarns": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "abbreviations"?: NonNullable<Json>,"adaptation"?: Json | null,"chart_hints"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"my_gauge_rows"?: number | null,"my_gauge_stitches"?: number | null,"notes"?: string,"pattern_gauge_rows"?: number | null,"pattern_gauge_stitches"?: number | null,"pdf_path"?: string | null,"profile_id"?: string,"size": string,"size_index"?: number | null,"sizes"?: (string)[],"title": string,"updated_at"?: string,"yarn_checks"?: NonNullable<Json>,"yarns"?: NonNullable<Json>
                  }
                  Update: {
                    "abbreviations"?: NonNullable<Json>,"adaptation"?: Json | null,"chart_hints"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"my_gauge_rows"?: number | null,"my_gauge_stitches"?: number | null,"notes"?: string,"pattern_gauge_rows"?: number | null,"pattern_gauge_stitches"?: number | null,"pdf_path"?: string | null,"profile_id"?: string,"size"?: string,"size_index"?: number | null,"sizes"?: (string)[],"title"?: string,"updated_at"?: string,"yarn_checks"?: NonNullable<Json>,"yarns"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "knit_projects_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"knit_queue": {
                  Row: {
                    "created_at": string,"id": string,"meters_needed": number | null,"needle_mm": number | null,"notes": string,"pdf_path": string | null,"priority": number,"profile_id": string,"size": string | null,"title": string,"url": string | null,"yarn_idea": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"meters_needed"?: number | null,"needle_mm"?: number | null,"notes"?: string,"pdf_path"?: string | null,"priority"?: number,"profile_id"?: string,"size"?: string | null,"title": string,"url"?: string | null,"yarn_idea"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"meters_needed"?: number | null,"needle_mm"?: number | null,"notes"?: string,"pdf_path"?: string | null,"priority"?: number,"profile_id"?: string,"size"?: string | null,"title"?: string,"url"?: string | null,"yarn_idea"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "knit_queue_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"knit_stash": {
                  Row: {
                    "created_at": string,"id": string,"notes": string,"profile_id": string,"updated_at": string,"yarn": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"notes"?: string,"profile_id"?: string,"updated_at"?: string,"yarn": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"notes"?: string,"profile_id"?: string,"updated_at"?: string,"yarn"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "knit_stash_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"knit_steps": {
                  Row: {
                    "done": boolean,"highlights": NonNullable<Json>,"id": string,"instructions": string,"notes": string,"pass": number,"position": number,"project_id": string,"row_count": number,"sections": NonNullable<Json>,"stitches": number | null,"times": number,"title": string,"total_rows": number | null,"translation": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "done"?: boolean,"highlights"?: NonNullable<Json>,"id"?: string,"instructions"?: string,"notes"?: string,"pass"?: number,"position": number,"project_id": string,"row_count"?: number,"sections"?: NonNullable<Json>,"stitches"?: number | null,"times"?: number,"title": string,"total_rows"?: number | null,"translation"?: string | null
                  }
                  Update: {
                    "done"?: boolean,"highlights"?: NonNullable<Json>,"id"?: string,"instructions"?: string,"notes"?: string,"pass"?: number,"position"?: number,"project_id"?: string,"row_count"?: number,"sections"?: NonNullable<Json>,"stitches"?: number | null,"times"?: number,"title"?: string,"total_rows"?: number | null,"translation"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "knit_steps_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "knit_projects"
      referencedColumns: ["id"]
    }
                  ]
                },"llm_usage": {
                  Row: {
                    "cache_creation_tokens": number,"cache_read_tokens": number,"created_at": string,"function": string,"id": number,"input_tokens": number,"mode": string | null,"model": string,"ok": boolean,"output_tokens": number,"requests": number,"user_id": string | null,"web_searches": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cache_creation_tokens"?: number,"cache_read_tokens"?: number,"created_at"?: string,"function": string,"id"?: never,"input_tokens"?: number,"mode"?: string | null,"model": string,"ok"?: boolean,"output_tokens"?: number,"requests"?: number,"user_id"?: string | null,"web_searches"?: number
                  }
                  Update: {
                    "cache_creation_tokens"?: number,"cache_read_tokens"?: number,"created_at"?: string,"function"?: string,"id"?: never,"input_tokens"?: number,"mode"?: string | null,"model"?: string,"ok"?: boolean,"output_tokens"?: number,"requests"?: number,"user_id"?: string | null,"web_searches"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "llm_usage_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"meal_presence_rules": {
                  Row: {
                    "ignored_keywords": (string)[],"profile_id": string,"updated_at": string,"weekday_lunch_at_work": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "ignored_keywords"?: (string)[],"profile_id"?: string,"updated_at"?: string,"weekday_lunch_at_work"?: boolean
                  }
                  Update: {
                    "ignored_keywords"?: (string)[],"profile_id"?: string,"updated_at"?: string,"weekday_lunch_at_work"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_presence_rules_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"meals": {
                  Row: {
                    "cook_id": string | null,"created_at": string,"created_by": string | null,"id": string,"meal_date": string,"people": (string)[],"recipe_id": string,"slot": Database["public"]['Enums']["meal_slot"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cook_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"meal_date": string,"people": (string)[],"recipe_id": string,"slot": Database["public"]['Enums']["meal_slot"],"updated_at"?: string
                  }
                  Update: {
                    "cook_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"meal_date"?: string,"people"?: (string)[],"recipe_id"?: string,"slot"?: Database["public"]['Enums']["meal_slot"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meals_cook_id_fkey"
      columns: ["cook_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meals_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meals_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_actions": {
                  Row: {
                    "created_at": string,"expires_at": string,"kind": string,"payload": NonNullable<Json>,"profile_id": string,"token": string,"used_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string,"kind": string,"payload": NonNullable<Json>,"profile_id": string,"token"?: string,"used_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"kind"?: string,"payload"?: NonNullable<Json>,"profile_id"?: string,"token"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_actions_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"planning_inbox": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"list": string,"photos": (string)[],"recipe_id": string | null,"title": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"list"?: string,"photos"?: (string)[],"recipe_id"?: string | null,"title": string,"url"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"list"?: string,"photos"?: (string)[],"recipe_id"?: string | null,"title"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "planning_inbox_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planning_inbox_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"plant_photos": {
                  Row: {
                    "created_at": string,"id": string,"plant_id": string,"position": number,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"plant_id": string,"position": number,"storage_path": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"plant_id"?: string,"position"?: number,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plant_photos_plant_id_fkey"
      columns: ["plant_id"]
isOneToOne: false
      referencedRelation: "plants"
      referencedColumns: ["id"]
    }
                  ]
                },"plants": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"id": string,"location": string | null,"name": string,"notes": string | null,"planted_height_cm": number | null,"planted_on": string | null,"pot_diameter_cm": number | null,"species": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"location"?: string | null,"name": string,"notes"?: string | null,"planted_height_cm"?: number | null,"planted_on"?: string | null,"pot_diameter_cm"?: number | null,"species"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"location"?: string | null,"name"?: string,"notes"?: string | null,"planted_height_cm"?: number | null,"planted_on"?: string | null,"pot_diameter_cm"?: number | null,"species"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plants_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"profile_id": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"profile_id"?: string,"user_agent"?: string | null
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"profile_id"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_ingredients": {
                  Row: {
                    "id": string,"linked_recipe_id": string | null,"name": string,"note": string | null,"position": number,"quantity": number | null,"recipe_id": string,"section": string | null,"unit": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"linked_recipe_id"?: string | null,"name": string,"note"?: string | null,"position": number,"quantity"?: number | null,"recipe_id": string,"section"?: string | null,"unit"?: string | null
                  }
                  Update: {
                    "id"?: string,"linked_recipe_id"?: string | null,"name"?: string,"note"?: string | null,"position"?: number,"quantity"?: number | null,"recipe_id"?: string,"section"?: string | null,"unit"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_ingredients_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_photos": {
                  Row: {
                    "created_at": string,"id": string,"position": number,"recipe_id": string,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"position": number,"recipe_id": string,"storage_path": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"position"?: number,"recipe_id"?: string,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_photos_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_reviews": {
                  Row: {
                    "comment": string | null,"profile_id": string,"rating": number | null,"recipe_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comment"?: string | null,"profile_id"?: string,"rating"?: number | null,"recipe_id": string,"updated_at"?: string
                  }
                  Update: {
                    "comment"?: string | null,"profile_id"?: string,"rating"?: number | null,"recipe_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_reviews_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_reviews_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"recipes": {
                  Row: {
                    "carbs_g": number | null,"cook_minutes": number | null,"created_at": string,"created_by": string | null,"fat_g": number | null,"id": string,"is_saved": boolean,"kcal": number | null,"notes": string | null,"nutrition_per": string | null,"prep_minutes": number | null,"protein_g": number | null,"rest_minutes": number | null,"servings": number | null,"source": string | null,"source_page": string | null,"tags": (string)[],"title": string,"updated_at": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "carbs_g"?: number | null,"cook_minutes"?: number | null,"created_at"?: string,"created_by"?: string | null,"fat_g"?: number | null,"id"?: string,"is_saved"?: boolean,"kcal"?: number | null,"notes"?: string | null,"nutrition_per"?: string | null,"prep_minutes"?: number | null,"protein_g"?: number | null,"rest_minutes"?: number | null,"servings"?: number | null,"source"?: string | null,"source_page"?: string | null,"tags"?: (string)[],"title": string,"updated_at"?: string,"url"?: string | null
                  }
                  Update: {
                    "carbs_g"?: number | null,"cook_minutes"?: number | null,"created_at"?: string,"created_by"?: string | null,"fat_g"?: number | null,"id"?: string,"is_saved"?: boolean,"kcal"?: number | null,"notes"?: string | null,"nutrition_per"?: string | null,"prep_minutes"?: number | null,"protein_g"?: number | null,"rest_minutes"?: number | null,"servings"?: number | null,"source"?: string | null,"source_page"?: string | null,"tags"?: (string)[],"title"?: string,"updated_at"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"shopping_events": {
                  Row: {
                    "actor_id": string,"created_at": string,"id": number,"item_name": string,"kind": Database["public"]['Enums']["shopping_event_kind"],"list_id": string,"notified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"created_at"?: string,"id"?: never,"item_name": string,"kind": Database["public"]['Enums']["shopping_event_kind"],"list_id": string,"notified_at"?: string | null
                  }
                  Update: {
                    "actor_id"?: string,"created_at"?: string,"id"?: never,"item_name"?: string,"kind"?: Database["public"]['Enums']["shopping_event_kind"],"list_id"?: string,"notified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "shopping_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shopping_events_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "shopping_lists"
      referencedColumns: ["id"]
    }
                  ]
                },"shopping_items": {
                  Row: {
                    "aisle": Database["public"]['Enums']["shopping_aisle"],"checked": boolean,"created_at": string,"created_by": string | null,"id": string,"list_id": string,"name": string,"position": number,"quantity": number | null,"unit": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aisle"?: Database["public"]['Enums']["shopping_aisle"],"checked"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"list_id": string,"name": string,"position"?: number,"quantity"?: number | null,"unit"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "aisle"?: Database["public"]['Enums']["shopping_aisle"],"checked"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"list_id"?: string,"name"?: string,"position"?: number,"quantity"?: number | null,"unit"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shopping_items_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shopping_items_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "shopping_lists"
      referencedColumns: ["id"]
    }
                  ]
                },"shopping_lists": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shopping_lists_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_settings": {
                  Row: {
                    "agenda_reminded_on": string | null,"agenda_scope": string,"disabled_pages": (string)[],"hydration_containers": NonNullable<Json>,"hydration_goal_ml": number,"hydration_reminded_at": string | null,"muted_notifications": (string)[],"plants_reminded_on": string | null,"profile_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agenda_reminded_on"?: string | null,"agenda_scope"?: string,"disabled_pages"?: (string)[],"hydration_containers"?: NonNullable<Json>,"hydration_goal_ml"?: number,"hydration_reminded_at"?: string | null,"muted_notifications"?: (string)[],"plants_reminded_on"?: string | null,"profile_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "agenda_reminded_on"?: string | null,"agenda_scope"?: string,"disabled_pages"?: (string)[],"hydration_containers"?: NonNullable<Json>,"hydration_goal_ml"?: number,"hydration_reminded_at"?: string | null,"muted_notifications"?: (string)[],"plants_reminded_on"?: string | null,"profile_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_settings_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"water_intakes": {
                  Row: {
                    "created_at": string,"drunk_at": string,"id": string,"profile_id": string,"volume_ml": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"drunk_at"?: string,"id"?: string,"profile_id"?: string,"volume_ml": number
                  }
                  Update: {
                    "created_at"?: string,"drunk_at"?: string,"id"?: string,"profile_id"?: string,"volume_ml"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "water_intakes_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"watering_events": {
                  Row: {
                    "amount_ml": number | null,"created_at": string,"done_by": string | null,"id": string,"note": string | null,"plant_id": string,"rule_id": string | null,"scheduled_on": string | null,"watered_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_ml"?: number | null,"created_at"?: string,"done_by"?: string | null,"id"?: string,"note"?: string | null,"plant_id": string,"rule_id"?: string | null,"scheduled_on"?: string | null,"watered_at"?: string
                  }
                  Update: {
                    "amount_ml"?: number | null,"created_at"?: string,"done_by"?: string | null,"id"?: string,"note"?: string | null,"plant_id"?: string,"rule_id"?: string | null,"scheduled_on"?: string | null,"watered_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "watering_events_done_by_fkey"
      columns: ["done_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "watering_events_plant_id_fkey"
      columns: ["plant_id"]
isOneToOne: false
      referencedRelation: "plants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "watering_events_rule_id_fkey"
      columns: ["rule_id"]
isOneToOne: false
      referencedRelation: "watering_rules"
      referencedColumns: ["id"]
    }
                  ]
                },"watering_rules": {
                  Row: {
                    "amount_ml": number,"created_at": string,"first_watering_on": string,"id": string,"interval_count": number,"interval_unit": Database["public"]['Enums']["watering_interval"],"months": (number)[],"note": string | null,"plant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_ml": number,"created_at"?: string,"first_watering_on": string,"id"?: string,"interval_count": number,"interval_unit": Database["public"]['Enums']["watering_interval"],"months": (number)[],"note"?: string | null,"plant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount_ml"?: number,"created_at"?: string,"first_watering_on"?: string,"id"?: string,"interval_count"?: number,"interval_unit"?: Database["public"]['Enums']["watering_interval"],"months"?: (number)[],"note"?: string | null,"plant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "watering_rules_plant_id_fkey"
      columns: ["plant_id"]
isOneToOne: false
      referencedRelation: "plants"
      referencedColumns: ["id"]
    }
                  ]
                },"weight_entries": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"measured_on": string,"profile_id": string,"updated_at": string,"weight_kg": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"measured_on": string,"profile_id": string,"updated_at"?: string,"weight_kg": number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"measured_on"?: string,"profile_id"?: string,"updated_at"?: string,"weight_kg"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "weight_entries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "weight_entries_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_ical_calendar":
{ Args: { "p_name": string,"p_url": string }; Returns: string
                           },
"add_to_inbox":
{ Args: { "p_list"?: string,"p_photos"?: (string)[],"p_recipe_id"?: string,"p_title"?: string,"p_url"?: string }; Returns: string
                           },
"agenda_reminders_due":
{ Args: { "p_now"?: string }; Returns: {
              "agenda_scope": string,"profile_id": string
            }[]
                           },
"claim_agenda_reminders":
{ Args: { "p_now"?: string }; Returns: {
              "agenda_scope": string,"profile_id": string
            }[]
                           },
"claim_hydration_reminders":
{ Args: { "p_now"?: string }; Returns: {
              "containers": Json,"drunk_ml": number,"goal_ml": number,"profile_id": string
            }[]
                           },
"claim_plant_reminders":
{ Args: { "p_now"?: string }; Returns: {
              "profile_id": string
            }[]
                           },
"create_food_period":
{ Args: { "p_end": string,"p_profile_id": string,"p_start": string }; Returns: string
                           },
"create_knit_project":
{ Args: { "p_pdf_path": string,"p_size": string,"p_steps": Json,"p_title": string }; Returns: string
                           } |
{ Args: { "p_pattern_gauge_rows": number,"p_pattern_gauge_stitches": number,"p_pdf_path": string,"p_queue_id": string,"p_size": string,"p_steps": Json,"p_title": string }; Returns: string
                           },
"set_knit_sections":
{ Args: { "p_steps": Json }; Returns: undefined
                           },
"split_knit_step":
{ Args: { "p_instructions": string,"p_new_instructions": string,"p_new_sections": Json,"p_new_title": string,"p_new_total_rows": number,"p_sections": Json,"p_step": string,"p_total_rows": number }; Returns: string
                           },
"merge_knit_steps":
{ Args: { "p_sections": Json,"p_step": string,"p_total_rows": number }; Returns: undefined
                           },
"create_meal":
{ Args: { "p_adhoc_notes"?: string,"p_adhoc_title"?: string,"p_adhoc_url"?: string,"p_meal_date": string,"p_people": (string)[],"p_recipe_id"?: string,"p_slot": Database["public"]['Enums']["meal_slot"] }; Returns: string
                           },
"create_notification_action":
{ Args: { "p_kind": string,"p_payload": Json,"p_profile_id": string }; Returns: string
                           },
"duplicate_meal":
{ Args: { "p_meal_date": string,"p_meal_id": string,"p_slot": Database["public"]['Enums']["meal_slot"] }; Returns: string
                           },
"find_saved_recipe_by_url":
{ Args: { "p_exclude"?: string,"p_url": string }; Returns: {
              "id": string,"title": string
            }[]
                           },
"hydration_containers_are_valid":
{ Args: { "p_containers": Json }; Returns: boolean
                           },
"hydration_reminders_due":
{ Args: { "p_now"?: string }; Returns: {
              "containers": Json,"drunk_ml": number,"goal_ml": number,"profile_id": string
            }[]
                           },
"knit_yarn_checks_are_valid":
{ Args: { "p_checks": Json }; Returns: boolean
                           },
"knit_yarns_are_valid":
{ Args: { "p_yarns": Json }; Returns: boolean
                           },
"link_recipe_ingredient":
{ Args: { "p_linked_recipe_id": string,"p_name": string,"p_position": number,"p_recipe_id": string }; Returns: undefined
                           },
"linkable_recipe":
{ Args: { "p_linked_recipe_id": string,"p_recipe_id": string }; Returns: string
                           },
"llm_usage_summary":
{ Args: { "p_since"?: string,"p_until"?: string }; Returns: {
              "cache_creation_tokens": number,"cache_read_tokens": number,"calls": number,"failures": number,"function": string,"input_tokens": number,"mode": string,"model": string,"output_tokens": number,"requests": number,"user_id": string,"web_searches": number
            }[]
                           },
"months_are_valid":
{ Args: { "p_months": (number)[] }; Returns: boolean
                           },
"normalize_unit":
{ Args: { "p_unit": string }; Returns: string
                           },
"plan_inbox_item":
{ Args: { "p_item_id": string,"p_meal_date": string,"p_people": (string)[],"p_slot": Database["public"]['Enums']["meal_slot"] }; Returns: string
                           },
"plan_week":
{ Args: { "p_meals": Json }; Returns: number
                           },
"plant_reminders_due":
{ Args: { "p_now"?: string }; Returns: {
              "profile_id": string
            }[]
                           },
"purge_llm_usage":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"recent_activity":
{ Args: { "p_since"?: string }; Returns: {
              "actor_id": string,"actor_name": string,"at": string,"detail": string,"kind": string,"target_id": string,"title": string
            }[]
                           },
"recipe_history":
{ Args: { "p_recipe_id"?: string,"p_today": string }; Returns: {
              "last_cooked": string,"next_planned": string,"recipe_id": string,"times_cooked": number
            }[]
                           },
"recipe_url_key":
{ Args: { "p_url": string }; Returns: string
                           },
"referenced_files":
{ Args: { "p_bucket": string }; Returns: string[]
                           },
"replace_calendar_events":
{ Args: { "p_events": Json,"p_source_id": string }; Returns: undefined
                           },
"replace_watering_rules":
{ Args: { "p_plant_id": string,"p_rules": Json }; Returns: undefined
                           },
"resolve_inbox_item":
{ Args: { "p_item_id": string,"p_recipe_id": string }; Returns: (string)[]
                           },
"run_notification_action":
{ Args: { "p_action": string,"p_token": string }; Returns: Json
                           },
"save_plant":
{ Args: { "p_plant": Json,"p_plant_id"?: string,"p_rules": Json }; Returns: string
                           },
"save_push_subscription":
{ Args: { "p_auth": string,"p_endpoint": string,"p_p256dh": string,"p_user_agent"?: string }; Returns: string
                           },
"save_recipe":
{ Args: { "p_cook_minutes"?: number,"p_ingredients": Json,"p_notes"?: string,"p_nutrition"?: Json,"p_prep_minutes"?: number,"p_recipe_id"?: string,"p_rest_minutes"?: number,"p_servings"?: number,"p_source"?: string,"p_source_page"?: string,"p_tags"?: (string)[],"p_title": string,"p_url"?: string }; Returns: string
                           },
"save_recipe_review":
{ Args: { "p_comment"?: string,"p_rating"?: number,"p_recipe_id": string }; Returns: undefined
                           },
"save_weigh_in":
{ Args: { "p_measured_on": string,"p_previous_date"?: string,"p_weights": Json }; Returns: undefined
                           },
"split_source":
{ Args: { "p_source": string }; Returns: (string)[]
                           },
"split_unit":
{ Args: { "p_unit": string }; Returns: Record<string, unknown>
                           },
"unit_key":
{ Args: { "p_unit": string }; Returns: string
                           },
"update_meal":
{ Args: { "p_adhoc_notes"?: string,"p_adhoc_title"?: string,"p_adhoc_url"?: string,"p_meal_id": string,"p_people": (string)[],"p_recipe_id"?: string }; Returns: undefined
                           },
"use_saved_recipe":
{ Args: { "p_adhoc_id": string,"p_saved_id": string }; Returns: number
                           },
"valid_pending_photos":
{ Args: { "p_photos": (string)[] }; Returns: boolean
                           }
          }
          Enums: {
            "food_meal": "BREAKFAST"|"LUNCH"|"SNACK"|"APERITIF"|"DINNER"|"POOL"|"SPORT","meal_slot": "LUNCH"|"DINNER","shopping_aisle": "FRUITS_LEGUMES"|"BOULANGERIE"|"BOUCHERIE_POISSON"|"CREMERIE"|"EPICERIE_SALEE"|"EPICERIE_SUCREE"|"SURGELES"|"BOISSONS"|"HYGIENE_MAISON"|"AUTRE","shopping_event_kind": "ADDED"|"CHECKED"|"UNCHECKED"|"UPDATED"|"REMOVED","watering_interval": "day"|"week"|"month"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "food_meal": ["BREAKFAST", "LUNCH", "SNACK", "APERITIF", "DINNER", "POOL", "SPORT"],"meal_slot": ["LUNCH", "DINNER"],"shopping_aisle": ["FRUITS_LEGUMES", "BOULANGERIE", "BOUCHERIE_POISSON", "CREMERIE", "EPICERIE_SALEE", "EPICERIE_SUCREE", "SURGELES", "BOISSONS", "HYGIENE_MAISON", "AUTRE"],"shopping_event_kind": ["ADDED", "CHECKED", "UNCHECKED", "UPDATED", "REMOVED"],"watering_interval": ["day", "week", "month"]
          }
        }
} as const
