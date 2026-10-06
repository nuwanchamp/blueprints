# =============================================================
#  Keyboard Skills Adventure with Pip
#  UNIT 2 RESULTS  (shown after Level 10)
#
#  Congratulations message + total star count (via the global
#  StarChart autoload) + a Home button back to the unit menu
#  (unit-menu.tscn) — not the welcome/title screen, whose Start
#  button always forwards into Unit 1's intro — plus a "Practice
#  More!" button into the replayable full-keyboard speed drill
#  (unit2-practice.tscn). Mirrors unit_1_results.gd, just scoped
#  to Unit 2's badge slots and re-themed to Unit 2's minty pastel.
#
#  Godot 4.x
# =============================================================
extends Node2D

const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const COL_BG := Color("e0f7f4")   # same fresh minty pastel as the rest of Unit 2

# --- Custom cursor, same on every screen ---
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

var _title: RichTextLabel
var _stars_label: RichTextLabel
var _home_btn: Button
var _practice_btn: Button


# ----------------------------------------------------------------
#  Setup
# ----------------------------------------------------------------
func _ready() -> void:
	# The final badge row should be visible here, however the player
	# arrived (normal flow, or the scene run standalone for testing).
	StarChart.show_chart(StarChart.UNIT_2_LEVELS)
	Input.set_custom_mouse_cursor(HAND_CURSOR, Input.CURSOR_ARROW)
	Input.set_custom_mouse_cursor(HAND_CURSOR, Input.CURSOR_POINTING_HAND)

	var bg := ColorRect.new()
	bg.color = COL_BG
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

	await _build_ui()
	_celebrate()


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null, Input.CURSOR_ARROW)
	Input.set_custom_mouse_cursor(null, Input.CURSOR_POINTING_HAND)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  UI: congratulations title, star count, Home button
# ----------------------------------------------------------------
func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)

	_title = RichTextLabel.new()
	_title.bbcode_enabled = true
	_title.fit_content = true
	_title.scroll_active = false
	_title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_title.add_theme_font_override("normal_font", UI_FONT)
	_title.add_theme_font_size_override("normal_font_size", 56)
	_title.add_theme_color_override("font_outline_color", Color("1d4a46"))
	_title.add_theme_constant_override("outline_size", 12)
	_title.anchor_left = 0.05
	_title.anchor_right = 0.95
	_title.anchor_top = 0.28
	_title.anchor_bottom = 0.42
	_title.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ "🎉 Congratulations! 🎉"
		+ "[/rainbow][/center]"
	)
	layer.add_child(_title)

	_stars_label = RichTextLabel.new()
	_stars_label.bbcode_enabled = true
	_stars_label.fit_content = true
	_stars_label.scroll_active = false
	_stars_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_stars_label.add_theme_font_override("normal_font", UI_FONT)
	_stars_label.add_theme_font_size_override("normal_font_size", 36)
	_stars_label.add_theme_color_override("font_outline_color", Color("1d4a46"))
	_stars_label.add_theme_constant_override("outline_size", 10)
	_stars_label.anchor_left = 0.05
	_stars_label.anchor_right = 0.95
	_stars_label.anchor_top = 0.46
	_stars_label.anchor_bottom = 0.58
	var earned := StarChart.star_count_for(StarChart.UNIT_2_LEVELS)
	var total := StarChart.UNIT_2_LEVELS.size()
	_stars_label.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ "You finished Unit 2 with %d / %d Stars!" % [earned, total]
		+ "[/rainbow][/center]"
	)
	layer.add_child(_stars_label)

	_home_btn = Button.new()
	_home_btn.text = "🏠  Home"
	_home_btn.add_theme_font_override("font", UI_FONT)
	_home_btn.add_theme_font_size_override("font_size", 30)
	_home_btn.anchor_left = 0.5
	_home_btn.anchor_right = 0.5
	_home_btn.anchor_top = 0.72
	_home_btn.anchor_bottom = 0.72
	_home_btn.offset_left = -230
	_home_btn.offset_right = -10
	_home_btn.offset_top = 0
	_home_btn.offset_bottom = 74
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
	_home_btn.add_theme_stylebox_override("normal", normal)
	_home_btn.add_theme_stylebox_override("pressed", normal)
	_home_btn.add_theme_stylebox_override("hover", hover)
	_home_btn.add_theme_color_override("font_color", Color("2c6e68"))
	_home_btn.add_theme_color_override("font_hover_color", Color("2c6e68"))
	_home_btn.add_theme_color_override("font_pressed_color", Color("2c6e68"))
	_home_btn.pressed.connect(_on_home_pressed)
	layer.add_child(_home_btn)

	_practice_btn = Button.new()
	_practice_btn.text = "⚡  Practice More!"
	_practice_btn.add_theme_font_override("font", UI_FONT)
	_practice_btn.add_theme_font_size_override("font_size", 26)
	_practice_btn.anchor_left = 0.5
	_practice_btn.anchor_right = 0.5
	_practice_btn.anchor_top = 0.72
	_practice_btn.anchor_bottom = 0.72
	_practice_btn.offset_left = 10
	_practice_btn.offset_right = 260
	_practice_btn.offset_top = 0
	_practice_btn.offset_bottom = 74
	_practice_btn.add_theme_stylebox_override("normal", normal)
	_practice_btn.add_theme_stylebox_override("pressed", normal)
	_practice_btn.add_theme_stylebox_override("hover", hover)
	_practice_btn.add_theme_color_override("font_color", Color("2c6e68"))
	_practice_btn.add_theme_color_override("font_hover_color", Color("2c6e68"))
	_practice_btn.add_theme_color_override("font_pressed_color", Color("2c6e68"))
	_practice_btn.pressed.connect(_on_practice_pressed)
	layer.add_child(_practice_btn)

	# Wait one frame so the Controls have their real sizes before we
	# pivot-scale them in — reading .size right after creation is 0.
	await get_tree().process_frame
	_animate_in()


func _animate_in() -> void:
	_title.pivot_offset = _title.size / 2
	_title.scale = Vector2.ZERO
	_stars_label.modulate.a = 0.0
	_home_btn.pivot_offset = _home_btn.size / 2
	_home_btn.scale = Vector2.ZERO
	_practice_btn.pivot_offset = _practice_btn.size / 2
	_practice_btn.scale = Vector2.ZERO

	var t := create_tween()
	t.tween_property(_title, "scale", Vector2.ONE, 0.5)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(_stars_label, "modulate:a", 1.0, 0.4)
	t.tween_property(_home_btn, "scale", Vector2.ONE, 0.35)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.parallel().tween_property(_practice_btn, "scale", Vector2.ONE, 0.35)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _on_home_pressed() -> void:
	get_tree().change_scene_to_file("res://Scenes/unit-menu.tscn")


func _on_practice_pressed() -> void:
	get_tree().change_scene_to_file("res://Scenes/unit2-practice.tscn")


# ----------------------------------------------------------------
#  Confetti celebration (generated, zero assets)
# ----------------------------------------------------------------
func _celebrate() -> void:
	var s := _screen_size()
	var xs: Array[float] = [s.x * 0.2, s.x * 0.5, s.x * 0.8]
	for i in xs.size():
		var pos := Vector2(xs[i], s.y * 0.12)
		get_tree().create_timer(i * 0.2).timeout.connect(
			func () -> void: _burst_confetti(pos)
		)


func _burst_confetti(pos: Vector2) -> void:
	var p := CPUParticles2D.new()
	p.one_shot = true
	p.emitting = true
	p.amount = 50
	p.lifetime = 1.4
	p.explosiveness = 1.0
	p.direction = Vector2(0, 1)
	p.spread = 60.0
	p.initial_velocity_min = 140.0
	p.initial_velocity_max = 300.0
	p.gravity = Vector2(0, 300)
	p.scale_amount_min = 2.0
	p.scale_amount_max = 4.5
	var grad := Gradient.new()
	grad.set_color(0, Color("ff6b6b"))
	grad.add_point(0.33, Color("ffd166"))
	grad.add_point(0.66, Color("06d6a0"))
	grad.set_color(1, Color("6b7fd7"))
	p.color_ramp = grad
	p.position = pos
	add_child(p)
	get_tree().create_timer(2.0).timeout.connect(p.queue_free)
