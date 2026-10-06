# =============================================================
#  Mouse Skills Adventure with Pip
#  GLOBAL CONFETTI RAIN  (autoload — "Confetti")
#
#  SETUP (once):
#  Project > Project Settings > Globals (Autoload) > add
#  confetti_rain.gd with the name: Confetti
#  (No scene needed — the script builds everything itself.)
#
#  USE (from any screen):
#      Confetti.rain()             # a shower across the whole width
#      Confetti.rain(100, 2.0)     # more pieces, spread over 2s
#
#  Pure Polygon2D + Tween — no particle nodes, no image assets, so
#  it works the same in every level regardless of what art exists.
#  Each piece spawns just above the top edge, drifts side to side
#  and spins while it falls, then frees itself once it drops off
#  the bottom of the screen.
#
#  Godot 4.x
# =============================================================
extends CanvasLayer

const COLORS: Array[Color] = [
	Color("ff6b6b"), Color("ffd166"), Color("06d6a0"),
	Color("6b7fd7"), Color("ff8fab"), Color("f4a259"),
]

const MIN_FALL_TIME := 1.8
const MAX_FALL_TIME := 3.2
const MIN_SWAY := 24.0
const MAX_SWAY := 60.0
const MIN_SPIN_TIME := 0.5
const MAX_SPIN_TIME := 1.3


func _ready() -> void:
	layer = 95   # above level content and the star badge row


func _screen_size() -> Vector2:
	return get_viewport().get_visible_rect().size


# ----------------------------------------------------------------
#  Public API
# ----------------------------------------------------------------
## Drops `count` confetti pieces from the top of the screen, staggered
## over `spawn_over` seconds so it reads as a shower rather than a pop.
## `x_range` restricts the horizontal spawn band (defaults to the
## full screen width).
func rain(count: int = 60, spawn_over: float = 1.2, x_range: Vector2 = Vector2(-1.0, -1.0)) -> void:
	var lo := x_range.x
	var hi := x_range.y
	if lo < 0.0 and hi < 0.0:
		lo = 0.0
		hi = _screen_size().x

	for i in count:
		var x := randf_range(lo, hi)
		var delay := randf() * spawn_over
		get_tree().create_timer(delay).timeout.connect(
			func () -> void: _spawn_piece(x)
		)


# ----------------------------------------------------------------
#  One falling piece
# ----------------------------------------------------------------
func _spawn_piece(x: float) -> void:
	var piece := Polygon2D.new()
	piece.polygon = _random_shape()
	piece.color = COLORS[randi() % COLORS.size()]
	piece.position = Vector2(x, -20.0)
	piece.rotation = randf_range(0.0, TAU)
	add_child(piece)

	var fall_time := randf_range(MIN_FALL_TIME, MAX_FALL_TIME)
	var sway := randf_range(MIN_SWAY, MAX_SWAY)
	var target_y := _screen_size().y + 20.0

	# Falls straight down; a mild ease-in mimics gravity settling in.
	var fall := create_tween()
	fall.tween_property(piece, "position:y", target_y, fall_time)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)

	# Side-to-side drift, right-left-center — ends where it started,
	# so each loop restart is seamless.
	var drift := create_tween().set_loops()
	drift.tween_property(piece, "position:x", x + sway, fall_time * 0.25)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	drift.tween_property(piece, "position:x", x - sway, fall_time * 0.5)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	drift.tween_property(piece, "position:x", x, fall_time * 0.25)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

	# Continuous spin, a full turn per loop so the restart never snaps.
	var spin := create_tween().set_loops()
	var turn := TAU if randf() < 0.5 else -TAU
	spin.tween_property(piece, "rotation", piece.rotation + turn,
		randf_range(MIN_SPIN_TIME, MAX_SPIN_TIME))

	await fall.finished
	drift.kill()
	spin.kill()
	piece.queue_free()


func _random_shape() -> PackedVector2Array:
	# Half paper strips (rectangles), half triangles - a believable mix.
	if randf() < 0.5:
		var w := randf_range(5.0, 8.0)
		var h := randf_range(10.0, 16.0)
		return PackedVector2Array([
			Vector2(-w, -h), Vector2(w, -h), Vector2(w, h), Vector2(-w, h)
		])
	var r := randf_range(7.0, 11.0)
	return PackedVector2Array([
		Vector2(0, -r), Vector2(r * 0.87, r * 0.5), Vector2(-r * 0.87, r * 0.5)
	])
