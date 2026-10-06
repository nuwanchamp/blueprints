extends Node2D

const NEXT_SCENE := "res://Scenes/unit1-into.tscn"
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")


func _on_video_stream_player_finished() -> void:
	_show_start_button()


# ----------------------------------------------------------------
#  START button — appears once the video ends, matching the style
#  of the old welcome-screen button (white/gold, black border+shadow).
# ----------------------------------------------------------------
func _show_start_button() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)

	var button := Button.new()
	button.text = "START"
	button.add_theme_font_override("font", UI_FONT)
	button.add_theme_font_size_override("font_size", 45)
	button.add_theme_color_override("font_color", Color("3a2e4d"))
	button.add_theme_color_override("font_hover_color", Color("3a2e4d"))
	button.add_theme_color_override("font_pressed_color", Color("3a2e4d"))

	button.anchor_left = 0.5
	button.anchor_right = 0.5
	button.anchor_top = 0.78
	button.anchor_bottom = 0.78
	button.offset_left = -130
	button.offset_right = 130
	button.offset_top = 0
	button.offset_bottom = 78

	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(1, 1, 1, 1)
	normal.border_width_left = 4
	normal.border_width_top = 4
	normal.border_width_right = 4
	normal.border_width_bottom = 4
	normal.border_color = Color(0.0018, 0.0018, 0.0018, 1)
	normal.corner_radius_top_left = 14
	normal.corner_radius_top_right = 14
	normal.corner_radius_bottom_right = 14
	normal.corner_radius_bottom_left = 14
	normal.shadow_color = Color(0.158, 0.158, 0.158, 0.6)
	normal.shadow_size = 2
	normal.shadow_offset = Vector2(4, 4)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color("ffd166")
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("pressed", normal)
	button.add_theme_stylebox_override("hover", hover)

	button.pressed.connect(_on_start_pressed)
	layer.add_child(button)

	# Pop in with a little bounce, pivoting from its own center.
	button.pivot_offset = Vector2(130, 39)
	button.scale = Vector2.ZERO
	var t := create_tween()
	t.tween_property(button, "scale", Vector2.ONE, 0.4)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	_show_level_menu_button(layer)


## A smaller secondary button under START, for an instructor to jump
## straight into level selection instead of the normal linear flow.
func _show_level_menu_button(layer: CanvasLayer) -> void:
	var button := Button.new()
	button.text = "📋 Choose a Level"
	button.add_theme_font_override("font", UI_FONT)
	button.add_theme_font_size_override("font_size", 26)
	button.add_theme_color_override("font_color", Color("3a2e4d"))
	button.add_theme_color_override("font_hover_color", Color("3a2e4d"))
	button.add_theme_color_override("font_pressed_color", Color("3a2e4d"))

	button.anchor_left = 0.5
	button.anchor_right = 0.5
	button.anchor_top = 0.78
	button.anchor_bottom = 0.78
	button.offset_left = -145
	button.offset_right = 145
	button.offset_top = 94
	button.offset_bottom = 148

	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(1, 1, 1, 1)
	normal.border_width_left = 4
	normal.border_width_top = 4
	normal.border_width_right = 4
	normal.border_width_bottom = 4
	normal.border_color = Color(0.0018, 0.0018, 0.0018, 1)
	normal.corner_radius_top_left = 14
	normal.corner_radius_top_right = 14
	normal.corner_radius_bottom_right = 14
	normal.corner_radius_bottom_left = 14
	normal.shadow_color = Color(0.158, 0.158, 0.158, 0.6)
	normal.shadow_size = 2
	normal.shadow_offset = Vector2(4, 4)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color("ffd166")
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("pressed", normal)
	button.add_theme_stylebox_override("hover", hover)

	button.pressed.connect(_on_level_menu_pressed)
	layer.add_child(button)

	button.pivot_offset = Vector2(145, 27)
	button.scale = Vector2.ZERO
	var t := create_tween()
	t.tween_property(button, "scale", Vector2.ONE, 0.4)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _on_start_pressed() -> void:
	get_tree().change_scene_to_file(NEXT_SCENE)


func _on_level_menu_pressed() -> void:
	get_tree().change_scene_to_file("res://Scenes/unit-menu.tscn")
