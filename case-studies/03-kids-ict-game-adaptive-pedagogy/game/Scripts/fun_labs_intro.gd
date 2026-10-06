# =============================================================
#  Mouse Skills Adventure with Pip
#  "FunLabs" LOADING SCREEN
#
#  Second half of the boot sequence: brand name bounces in, then
#  a native (Polygon2D/Control-free-of-assets) progress bar fills
#  up while a percentage ticks over, then hands off to the
#  existing pilot1 intro exactly as before.
#
#  Godot 4.x
# =============================================================
extends Node2D

const NEXT_SCENE := "res://Scenes/init-screen.tscn"

const COL_BG   := Color("fff0d6")   # warm celebratory cream
const FILL_SECONDS := 2.2
const HOLD_SECONDS := 0.4
const FADE_SECONDS := 0.5

const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")

const BAR_COLORS: Array[Color] = [
	Color("ff6b6b"), Color("ffd166"), Color("06d6a0"), Color("6b7fd7"),
]

var _bar_fill: Panel
var _percent_label: Label
var _fade: ColorRect
var _progress := 0.0


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = COL_BG
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)

	var title := _build_title(layer)
	_build_bar(layer)
	_build_fade(layer)

	title.pivot_offset = title.size / 2
	title.scale = Vector2.ZERO
	var t := create_tween()
	t.tween_property(title, "scale", Vector2.ONE * 1.08, 0.5)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(title, "scale", Vector2.ONE, 0.15)
	t.tween_callback(_run_loading_bar)


# ----------------------------------------------------------------
#  Title
# ----------------------------------------------------------------
func _build_title(layer: CanvasLayer) -> RichTextLabel:
	var title := RichTextLabel.new()
	title.bbcode_enabled = true
	title.fit_content = true
	title.scroll_active = false
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.add_theme_font_override("normal_font", UI_FONT)
	title.add_theme_font_size_override("normal_font_size", 64)
	title.add_theme_color_override("font_outline_color", Color("5a4a6b"))
	title.add_theme_constant_override("outline_size", 12)
	title.anchor_left = 0.05
	title.anchor_right = 0.95
	title.anchor_top = 0.34
	title.anchor_bottom = 0.5
	title.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ "FunLabs"
		+ "[/rainbow][/center]"
	)
	layer.add_child(title)
	return title


# ----------------------------------------------------------------
#  Loading bar: rounded track + rounded fill, both StyleBoxFlat
# ----------------------------------------------------------------
func _build_bar(layer: CanvasLayer) -> void:
	var track := Panel.new()
	track.anchor_left = 0.22
	track.anchor_right = 0.78
	track.anchor_top = 0.66
	track.anchor_bottom = 0.72
	var track_box := StyleBoxFlat.new()
	track_box.bg_color = Color(1, 1, 1, 1)
	track_box.border_width_left = 4
	track_box.border_width_top = 4
	track_box.border_width_right = 4
	track_box.border_width_bottom = 4
	track_box.border_color = Color("5a4a6b")
	track_box.corner_radius_top_left = 20
	track_box.corner_radius_top_right = 20
	track_box.corner_radius_bottom_left = 20
	track_box.corner_radius_bottom_right = 20
	track_box.shadow_color = Color(0.158, 0.158, 0.158, 0.5)
	track_box.shadow_size = 3
	track_box.shadow_offset = Vector2(3, 4)
	track.add_theme_stylebox_override("panel", track_box)
	layer.add_child(track)

	_bar_fill = Panel.new()
	_bar_fill.anchor_left = 0.0
	_bar_fill.anchor_right = 0.0   # grows toward 1.0 as loading progresses
	_bar_fill.anchor_top = 0.0
	_bar_fill.anchor_bottom = 1.0
	_bar_fill.offset_left = 5
	_bar_fill.offset_top = 5
	_bar_fill.offset_bottom = -5
	var fill_box := StyleBoxFlat.new()
	fill_box.bg_color = BAR_COLORS[0]
	fill_box.corner_radius_top_left = 14
	fill_box.corner_radius_top_right = 14
	fill_box.corner_radius_bottom_left = 14
	fill_box.corner_radius_bottom_right = 14
	_bar_fill.add_theme_stylebox_override("panel", fill_box)
	track.add_child(_bar_fill)

	_percent_label = Label.new()
	_percent_label.add_theme_font_override("font", UI_FONT)
	_percent_label.add_theme_font_size_override("font_size", 28)
	_percent_label.add_theme_color_override("font_color", Color("5a4a6b"))
	_percent_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_percent_label.anchor_left = 0.22
	_percent_label.anchor_right = 0.78
	_percent_label.anchor_top = 0.74
	_percent_label.anchor_bottom = 0.8
	_percent_label.text = "0%"
	layer.add_child(_percent_label)


func _run_loading_bar() -> void:
	var t := create_tween()
	t.tween_method(_set_progress, 0.0, 1.0, FILL_SECONDS).set_trans(Tween.TRANS_SINE)
	await t.finished
	await get_tree().create_timer(HOLD_SECONDS).timeout
	await _fade_out()
	get_tree().change_scene_to_file(NEXT_SCENE)


func _set_progress(p: float) -> void:
	_progress = p
	_bar_fill.anchor_right = p
	_percent_label.text = "%d%%" % int(round(p * 100.0))

	var stops := BAR_COLORS.size() - 1
	var seg := clampf(p, 0.0, 0.999) * stops
	var i := int(seg)
	var frac := seg - i
	var box := _bar_fill.get_theme_stylebox("panel") as StyleBoxFlat
	box.bg_color = BAR_COLORS[i].lerp(BAR_COLORS[i + 1], frac)


# ----------------------------------------------------------------
#  Fade to next scene
# ----------------------------------------------------------------
func _build_fade(layer: CanvasLayer) -> void:
	_fade = ColorRect.new()
	_fade.color = COL_BG
	_fade.anchor_right = 1.0
	_fade.anchor_bottom = 1.0
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fade.modulate.a = 0.0
	layer.add_child(_fade)


func _fade_out() -> void:
	var t := create_tween()
	t.tween_property(_fade, "modulate:a", 1.0, FADE_SECONDS)
	await t.finished
