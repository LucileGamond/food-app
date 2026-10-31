
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
            "food_consumptions": {
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
                },"meals": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"meal_date": string,"people": (string)[],"recipe_id": string,"slot": Database["public"]['Enums']["meal_slot"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"meal_date": string,"people": (string)[],"recipe_id": string,"slot": Database["public"]['Enums']["meal_slot"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"meal_date"?: string,"people"?: (string)[],"recipe_id"?: string,"slot"?: Database["public"]['Enums']["meal_slot"],"updated_at"?: string
                  }
                  Relationships: [
                    {
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
                },"planning_inbox": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"recipe_id": string | null,"title": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"recipe_id"?: string | null,"title": string,"url"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"recipe_id"?: string | null,"title"?: string,"url"?: string | null
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
            "add_to_inbox":
{ Args: { "p_recipe_id"?: string,"p_title"?: string,"p_url"?: string }; Returns: string
                           },
"create_food_period":
{ Args: { "p_end": string,"p_profile_id": string,"p_start": string }; Returns: string
                           },
"create_meal":
{ Args: { "p_adhoc_notes"?: string,"p_adhoc_title"?: string,"p_adhoc_url"?: string,"p_meal_date": string,"p_people": (string)[],"p_recipe_id"?: string,"p_slot": Database["public"]['Enums']["meal_slot"] }; Returns: string
                           },
"duplicate_meal":
{ Args: { "p_meal_date": string,"p_meal_id": string,"p_slot": Database["public"]['Enums']["meal_slot"] }; Returns: string
                           },
"find_saved_recipe_by_url":
{ Args: { "p_exclude"?: string,"p_url": string }; Returns: {
              "id": string,"title": string
            }[]
                           },
"link_recipe_ingredient":
{ Args: { "p_linked_recipe_id": string,"p_name": string,"p_position": number,"p_recipe_id": string }; Returns: undefined
                           },
"linkable_recipe":
{ Args: { "p_linked_recipe_id": string,"p_recipe_id": string }; Returns: string
                           },
"normalize_unit":
{ Args: { "p_unit": string }; Returns: string
                           },
"plan_inbox_item":
{ Args: { "p_item_id": string,"p_meal_date": string,"p_people": (string)[],"p_slot": Database["public"]['Enums']["meal_slot"] }; Returns: string
                           },
"recipe_url_key":
{ Args: { "p_url": string }; Returns: string
                           },
"save_push_subscription":
{ Args: { "p_auth": string,"p_endpoint": string,"p_p256dh": string,"p_user_agent"?: string }; Returns: string
                           },
"save_recipe":
{ Args: { "p_cook_minutes"?: number,"p_ingredients": Json,"p_notes"?: string,"p_nutrition"?: Json,"p_prep_minutes"?: number,"p_recipe_id"?: string,"p_rest_minutes"?: number,"p_servings"?: number,"p_source"?: string,"p_source_page"?: string,"p_tags"?: (string)[],"p_title": string,"p_url"?: string }; Returns: string
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
                           }
          }
          Enums: {
            "food_meal": "BREAKFAST"|"LUNCH"|"SNACK"|"APERITIF"|"DINNER"|"POOL"|"SPORT","meal_slot": "LUNCH"|"DINNER","shopping_aisle": "FRUITS_LEGUMES"|"BOULANGERIE"|"BOUCHERIE_POISSON"|"CREMERIE"|"EPICERIE_SALEE"|"EPICERIE_SUCREE"|"SURGELES"|"BOISSONS"|"HYGIENE_MAISON"|"AUTRE","shopping_event_kind": "ADDED"|"CHECKED"|"UNCHECKED"|"UPDATED"|"REMOVED"
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
            "food_meal": ["BREAKFAST", "LUNCH", "SNACK", "APERITIF", "DINNER", "POOL", "SPORT"],"meal_slot": ["LUNCH", "DINNER"],"shopping_aisle": ["FRUITS_LEGUMES", "BOULANGERIE", "BOUCHERIE_POISSON", "CREMERIE", "EPICERIE_SALEE", "EPICERIE_SUCREE", "SURGELES", "BOISSONS", "HYGIENE_MAISON", "AUTRE"],"shopping_event_kind": ["ADDED", "CHECKED", "UNCHECKED", "UPDATED", "REMOVED"]
          }
        }
} as const
