# =============================================================
#  RAINBOW ROOTS ACADEMY
#  UNIT MENU  (choose Unit 1 or Unit 2)
#
#  Reached from welcome.tscn's "Choose a Level" button. Lets an
#  instructor (or child) jump straight into either unit's level
#  menu, bypassing the linear START flow. Built procedurally, same
#  pattern as unit_1_results.gd / unit_2_results.gd.
#
#  Godot 4.x
# =============================================================
extends Node2D

const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const COL_BG := Color("fdf6e3")   # warm neutral — sits between Unit 1's cream and Unit 2's mint
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

const PIP_TEXTURE: Texture2D = preload("res://Assets/idle-mouse-trans.png")
const ZIG_TEXTURE: Texture2D = preload("res://Assets/keyboard-mascot-trans.png")

const CARD_SIZE := Vector2(360, 440)
const CARD_GAP := 60.0


func _ready() -> void:
	StarChart.hide_chart()
	Input.set_custom_mouse_cursor(HAND_CURSOR)

	var bg := ColorRect.new()
	bg.color = COL_BG
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

	_build_ui()


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)

	var title := RichTextLabel.new()
	title.bbcode_enabled = true
	title.fit_content = true
	title.scroll_active = false
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.add_theme_font_override("normal_font", UI_FONT)
	title.add_theme_font_size_override("normal_font_size", 44)
	title.add_theme_color_override("font_outline_color", Color("5a4a6b"))
	title.add_theme_constant_override("outline_size", 10)
	title.anchor_left = 0.05
	title.anchor_right = 0.95
	title.anchor_top = 0.06
	title.anchor_bottom = 0.18
	title.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ "Choose a Unit!"
		+ "[/rainbow][/center]"
	)
	layer.add_child(title)

	var s := _screen_size()
	var total_w := CARD_SIZE.x * 2 + CARD_GAP
	var left := s.x * 0.5 - total_w * 0.5
	var top := s.y * 0.5 - CARD_SIZE.y * 0.5

	_build_card(
		layer,
		Vector2(left, top),
		PIP_TEXTURE,
		"Unit 1",
		"Mouse Skills",
		StarChart.star_count_for(StarChart.UNIT_1_LEVELS),
		StarChart.UNIT_1_LEVELS.size(),
		"res://Scenes/unit1-level-menu.tscn"
	)
	_build_card(
		layer,
		Vector2(left + CARD_SIZE.x + CARD_GAP, top),
		ZIG_TEXTURE,
		"Unit 2",
		"Keyboard Skills",
		StarChart.star_count_for(StarChart.UNIT_2_LEVELS),
		StarChart.UNIT_2_LEVELS.size(),
		"res://Scenes/unit2-level-menu.tscn"
	)

	_build_home_button(layer)


func _build_card(
	layer: CanvasLayer,
	pos: Vector2,
	mascot: Texture2D,
	eyebrow: String,
	subtitle: String,
	earned: int,
	total: int,
	target_scene: String
) -> void:
	var btn := Button.new()
	btn.position = pos
	btn.size = CARD_SIZE
	btn.flat = false

	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(1, 1, 1, 1)
	normal.border_width_left = 5
	normal.border_width_top = 5
	normal.border_width_right = 5
	normal.border_width_bottom = 5
	normal.border_color = Color("2c6e68")
	normal.corner_radius_top_left = 24
	normal.corner_radius_top_right = 24
	normal.corner_radius_bottom_right = 24
	normal.corner_radius_bottom_left = 24
	normal.shadow_color = Color(0.158, 0.158, 0.158, 0.5)
	normal.shadow_size = 4
	normal.shadow_offset = Vector2(5, 6)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color("fff0d6")
	btn.add_theme_stylebox_override("normal", normal)
	btn.add_theme_stylebox_override("pressed", normal)
	btn.add_theme_stylebox_override("hover", hover)
	btn.pressed.connect(func () -> void: get_tree().change_scene_to_file(target_scene))
	layer.add_child(btn)

	# A plain scaled Sprite2D, not a TextureRect — stretch modes on
	# TextureRect render outside its own rect with no clipping by default,
	# which let Pip's wide mascot art bleed past the card border. Scaling
	# by the smaller of the width/height fit ratios guarantees it stays
	# inside the box regardless of the source art's aspect ratio.
	var mascot_box := Vector2(CARD_SIZE.x * 0.7, CARD_SIZE.y * 0.5)
	var mascot_sprite := Sprite2D.new()
	mascot_sprite.texture = mascot
	var tex_size := mascot.get_size()
	var fit_scale := minf(mascot_box.x / tex_size.x, mascot_box.y / tex_size.y)
	mascot_sprite.scale = Vector2.ONE * fit_scale
	mascot_sprite.position = Vector2(CARD_SIZE.x * 0.5, CARD_SIZE.y * 0.08 + mascot_box.y * 0.5)
	btn.add_child(mascot_sprite)

	var eyebrow_label := Label.new()
	eyebrow_label.text = eyebrow
	eyebrow_label.add_theme_font_override("font", UI_FONT)
	eyebrow_label.add_theme_font_size_override("font_size", 22)
	eyebrow_label.add_theme_color_override("font_color", Color("9a8fae"))
	eyebrow_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	eyebrow_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	eyebrow_label.anchor_left = 0.0
	eyebrow_label.anchor_right = 1.0
	eyebrow_label.anchor_top = 0.6
	eyebrow_label.anchor_bottom = 0.68
	btn.add_child(eyebrow_label)

	var subtitle_label := Label.new()
	subtitle_label.text = subtitle
	subtitle_label.add_theme_font_override("font", UI_FONT)
	subtitle_label.add_theme_font_size_override("font_size", 32)
	subtitle_label.add_theme_color_override("font_color", Color("3a2e4d"))
	subtitle_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	subtitle_label.anchor_left = 0.0
	subtitle_label.anchor_right = 1.0
	subtitle_label.anchor_top = 0.68
	subtitle_label.anchor_bottom = 0.8
	btn.add_child(subtitle_label)

	var stars_label := RichTextLabel.new()
	stars_label.bbcode_enabled = true
	stars_label.fit_content = true
	stars_label.scroll_active = false
	stars_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stars_label.add_theme_font_override("normal_font", UI_FONT)
	stars_label.add_theme_font_size_override("normal_font_size", 24)
	stars_label.add_theme_color_override("default_color", Color("2c6e68"))
	stars_label.anchor_left = 0.0
	stars_label.anchor_right = 1.0
	stars_label.anchor_top = 0.82
	stars_label.anchor_bottom = 0.96
	stars_label.text = "[center]⭐ %d / %d[/center]" % [earned, total]
	btn.add_child(stars_label)


func _build_home_button(layer: CanvasLayer) -> void:
	var home_btn := Button.new()
	home_btn.text = "🏠  Home"
	home_btn.add_theme_font_override("font", UI_FONT)
	home_btn.add_theme_font_size_override("font_size", 24)
	home_btn.anchor_left = 0.0
	home_btn.anchor_top = 0.0
	home_btn.offset_left = 20
	home_btn.offset_top = 20
	home_btn.offset_right = 160
	home_btn.offset_bottom = 74

	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(1, 1, 1, 1)
	normal.border_width_left = 3
	normal.border_width_top = 3
	normal.border_width_right = 3
	normal.border_width_bottom = 3
	normal.border_color = Color(0.0018, 0.0018, 0.0018, 1)
	normal.corner_radius_top_left = 12
	normal.corner_radius_top_right = 12
	normal.corner_radius_bottom_right = 12
	normal.corner_radius_bottom_left = 12
	normal.shadow_color = Color(0.158, 0.158, 0.158, 0.6)
	normal.shadow_size = 2
	normal.shadow_offset = Vector2(3, 3)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color("ffd166")
	home_btn.add_theme_stylebox_override("normal", normal)
	home_btn.add_theme_stylebox_override("pressed", normal)
	home_btn.add_theme_stylebox_override("hover", hover)
	home_btn.add_theme_color_override("font_color", Color("3a2e4d"))
	home_btn.add_theme_color_override("font_hover_color", Color("3a2e4d"))
	home_btn.add_theme_color_override("font_pressed_color", Color("3a2e4d"))
	home_btn.pressed.connect(func () -> void: get_tree().change_scene_to_file("res://Scenes/welcome.tscn"))
	layer.add_child(home_btn)
