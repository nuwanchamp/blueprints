# =============================================================
#  Mouse Skills Adventure with Pip
#  OPENING SPLASH — "Rainbow Roots Academy presents"
#
#  The very first thing players see. The logo bounces in, the
#  title text rainbow-shimmers in beneath it, a few soft sparkles
#  twinkle in the background, then the whole screen fades and
#  hands off to the FunLabs loading screen.
#
#  Godot 4.x
# =============================================================
extends Node2D

const NEXT_SCENE := "res://Scenes/fun-labs-intro.tscn"

const COL_BG := Color("faf0ff")   # soft pastel lavender-pink
const HOLD_SECONDS := 2.2
const FADE_SECONDS := 0.6

const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")

@onready var _logo: Sprite2D = $Sprite2D

var _title: RichTextLabel
var _fade: ColorRect


func _ready() -> void:
	# The scene file's baked position was hand-placed for the editor's
	# default canvas size — recenter here so it stays centered at
	# whatever the actual screen size turns out to be.
	_logo.position = Vector2(_screen_size().x * 0.5, _screen_size().y * 0.34)

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

	_build_sparkles()
	_build_title(layer)
	_build_fade(layer)

	# Logo bounces in from nothing.
	var base_scale := _logo.scale
	_logo.scale = Vector2.ZERO
	var t := create_tween()
	t.tween_property(_logo, "scale", base_scale * 1.08, 0.55)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(_logo, "scale", base_scale, 0.18)
	t.tween_callback(_show_title)

	await get_tree().create_timer(HOLD_SECONDS).timeout
	await _fade_out()
	get_tree().change_scene_to_file(NEXT_SCENE)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  Title text
# ----------------------------------------------------------------
func _build_title(layer: CanvasLayer) -> void:
	_title = RichTextLabel.new()
	_title.bbcode_enabled = true
	_title.fit_content = true
	_title.scroll_active = false
	_title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_title.add_theme_font_override("normal_font", UI_FONT)
	_title.add_theme_font_size_override("normal_font_size", 30)
	_title.add_theme_color_override("font_outline_color", Color("5a4a6b"))
	_title.add_theme_constant_override("outline_size", 9)
	_title.anchor_left = 0.05
	_title.anchor_right = 0.95
	_title.anchor_top = 0.62
	_title.anchor_bottom = 0.74
	_title.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ "Rainbow Roots Academy presents"
		+ "[/rainbow][/center]"
	)
	_title.modulate.a = 0.0
	layer.add_child(_title)


func _show_title() -> void:
	var t := create_tween()
	t.tween_property(_title, "modulate:a", 1.0, 0.45)


# ----------------------------------------------------------------
#  Background sparkles (Polygon2D, no assets)
# ----------------------------------------------------------------
func _build_sparkles() -> void:
	var s := _screen_size()
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	for i in 14:
		var pos := Vector2(rng.randf_range(0.05, 0.95) * s.x, rng.randf_range(0.05, 0.9) * s.y)
		_spawn_sparkle(pos, rng.randf_range(6.0, 12.0))


func _spawn_sparkle(pos: Vector2, size: float) -> void:
	var star := Polygon2D.new()
	var pts := PackedVector2Array()
	for k in 8:
		var r := size if k % 2 == 0 else size * 0.4
		var ang := TAU * k / 8.0
		pts.append(Vector2(cos(ang), sin(ang)) * r)
	star.polygon = pts
	star.color = Color(1, 1, 1, 0.85)
	star.position = pos
	add_child(star)

	var t := create_tween().set_loops()
	var dur := randf_range(1.0, 1.8)
	t.tween_property(star, "modulate:a", 0.15, dur).set_trans(Tween.TRANS_SINE)
	t.tween_property(star, "modulate:a", 0.85, dur).set_trans(Tween.TRANS_SINE)


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
