# =============================================================
#  Mouse Skills Adventure with Pip
#  GLOBAL STAR CHART  (autoload)
#
#  SETUP (once):
#  1. Save this file as star_chart.gd in your project.
#  2. Project > Project Settings > Globals (Autoload) >
#     add star_chart.gd with the name:  StarChart
#     (No scene needed — the script builds everything itself.)
#
#  USE (in every level):
#      func _award_star() -> void:
#          await StarChart.add_star(LEVEL_NUMBER)
#          level_completed.emit(LEVEL_NUMBER)
#
#  Then DELETE the level's local star tween code and its
#  _star_points() helper — the chart handles all of it now.
#
#  WHAT IT DOES
#  - Shows a badge row at the TOP CENTER of the screen:
#    one slot per level; earned stars are gold, unearned are
#    faint grey outlines, so children see their progress.
#  - add_star(): a big star pops in mid-screen with a chime,
#    then flies up into its slot in the top-center row.
#  - Progress is saved to user://star_chart.cfg and reloaded
#    automatically, so stars survive closing the game.
#  - StarChart.reset() clears everything (for a new pupil).
#
#  Godot 4.x
# =============================================================
extends CanvasLayer

signal star_earned(level_number: int)

# The level numbers that appear in the chart, in display order.
# 1-10: Unit 1 (Mouse Skills). 11-19: Unit 2 (Keyboard Skills) —
# levels 2-10 award a star each; level 1 ("Meet the Keyboard") is
# pure orientation, same as Unit 1's star-free "Meet Pip".
const UNIT_1_LEVELS: Array[int] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const UNIT_2_LEVELS: Array[int] = [11, 12, 13, 14, 15, 16, 17, 18, 19]
const LEVELS: Array[int] = [
	1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
	11, 12, 13, 14, 15, 16, 17, 18, 19,
]

const SAVE_PATH := "user://star_chart.cfg"

const BADGE_Y := 36.0            # vertical position of the row
const BADGE_SPACING := 46.0      # px between badge centers
const BADGE_SCALE := 0.42        # size of the small badges
const GOLD := Color("ffd166")
const EMPTY := Color(0.55, 0.5, 0.6, 0.35)

var _stars: Dictionary = {}      # level_number -> true
var _celebrating := false        # guards against double animations
var _badges: Node2D              # holds the top-center row
var _active_levels: Array[int] = UNIT_1_LEVELS   # which unit's row is shown


func _ready() -> void:
	layer = 90                   # draw above every level's UI
	_badges = Node2D.new()
	add_child(_badges)
	_load()
	_refresh_badges()
	get_viewport().size_changed.connect(_refresh_badges)
	# Hidden by default — each screen reveals it only when relevant
	# (right before a star is awarded, or on the final results screen).
	visible = false


# ----------------------------------------------------------------
#  Public API
# ----------------------------------------------------------------
## Shows the badge row. Pass a level subset (UNIT_1_LEVELS / UNIT_2_LEVELS)
## so the row only displays that unit's levels — omit to keep whichever
## unit was shown last.
func show_chart(levels: Array[int] = []) -> void:
	if not levels.is_empty():
		_active_levels = levels
		_refresh_badges()
	visible = true


func hide_chart() -> void:
	visible = false


func has_star(level: int) -> bool:
	return _stars.has(level)


func star_count() -> int:
	return _stars.size()


## Stars earned within a specific subset of levels (e.g. UNIT_1_LEVELS),
## so a per-unit results screen can show "9 / 10" instead of the grand
## total across every unit.
func star_count_for(levels: Array[int]) -> int:
	var n := 0
	for level in levels:
		if _stars.has(level):
			n += 1
	return n


func all_earned() -> bool:
	return _stars.size() >= LEVELS.size()


func reset() -> void:
	_stars.clear()
	_save()
	_refresh_badges()


## Records the star and plays the celebration. Await it:
##     await StarChart.add_star(LEVEL_NUMBER)
func add_star(level: int) -> void:
	if not _stars.has(level):
		_stars[level] = true
		_save()

	# If a celebration is already playing (e.g. add_star was called
	# twice), record silently and skip the duplicate animation.
	if _celebrating:
		_refresh_badges()
		star_earned.emit(level)
		return
	_celebrating = true

	var target := _slot_position(level)

	# Big star pops in mid-screen...
	var star := _make_star(46.0, 20.0, GOLD)
	star.position = _screen_size() * 0.5
	star.scale = Vector2.ZERO
	add_child(star)
	_play_chime()

	var t := create_tween()
	t.tween_property(star, "scale", Vector2.ONE * 1.5, 0.5)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.parallel().tween_property(star, "rotation", 0.35, 0.5)
	t.tween_property(star, "scale", Vector2.ONE * 1.2, 0.2)
	t.parallel().tween_property(star, "rotation", 0.0, 0.2)
	t.tween_interval(0.5)
	# ...then flies UP to its slot in the top-center row.
	t.tween_property(star, "position", target, 0.8)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	t.parallel().tween_property(star, "scale", Vector2.ONE * BADGE_SCALE, 0.8)
	await t.finished

	star.queue_free()
	_refresh_badges()
	_pulse_badge(level)
	_celebrating = false
	star_earned.emit(level)


# ----------------------------------------------------------------
#  Badge row (top center)
# ----------------------------------------------------------------
func _screen_size() -> Vector2:
	return get_viewport().get_visible_rect().size


func _slot_position(level: int) -> Vector2:
	var idx := _active_levels.find(level)
	if idx < 0:
		idx = _active_levels.size()   # unknown level: park it after the row
	var total := _active_levels.size()
	var row_width := float(total - 1) * BADGE_SPACING
	var x := _screen_size().x * 0.5 - row_width * 0.5 + float(idx) * BADGE_SPACING
	return Vector2(x, BADGE_Y)


func _refresh_badges() -> void:
	for child in _badges.get_children():
		child.queue_free()
	for level in _active_levels:
		var earned := _stars.has(level)
		var badge := _make_star(46.0, 20.0, GOLD if earned else EMPTY)
		badge.position = _slot_position(level)
		badge.scale = Vector2.ONE * BADGE_SCALE
		badge.name = "Badge%d" % level
		_badges.add_child(badge)


func _pulse_badge(level: int) -> void:
	var badge := _badges.get_node_or_null("Badge%d" % level)
	if badge is Node2D:
		var b := badge as Node2D
		var t := create_tween()
		t.tween_property(b, "scale", Vector2.ONE * BADGE_SCALE * 1.5, 0.15)\
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		t.tween_property(b, "scale", Vector2.ONE * BADGE_SCALE, 0.2)


const STROKE_WIDTH := 6.0
const SHADOW_OFFSET := Vector2(2.5, 4.0)
const SHADOW_COLOR := Color(0, 0, 0, 0.25)
const ROUND_RATIO := 0.22        # rounding amount, relative to outer radius
const ROUND_SEGMENTS := 6        # smoothness of each rounded corner

func _star_points(outer: float, inner: float) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for k in 10:
		var r := outer if k % 2 == 0 else inner
		var ang := -PI / 2 + TAU * k / 10.0
		pts.append(Vector2(cos(ang), sin(ang)) * r)
	return pts


## Softens every corner of a polygon into a short rounded curve (a quadratic
## Bezier per vertex), so sharp star tips and inner notches both read as
## friendly, rounded shapes instead of pointy ones.
func _round_polygon(raw: PackedVector2Array, round_amount: float) -> PackedVector2Array:
	var pts := PackedVector2Array()
	var n := raw.size()
	for i in n:
		var prev := raw[(i - 1 + n) % n]
		var curr := raw[i]
		var next := raw[(i + 1) % n]

		var to_prev := prev - curr
		var to_next := next - curr
		var r := minf(minf(round_amount, to_prev.length() * 0.45), to_next.length() * 0.45)

		var a := curr + to_prev.normalized() * r
		var b := curr + to_next.normalized() * r

		for s in ROUND_SEGMENTS + 1:
			var t := float(s) / ROUND_SEGMENTS
			var p0 := a.lerp(curr, t)
			var p1 := curr.lerp(b, t)
			pts.append(p0.lerp(p1, t))
	return pts


func _rounded_star(outer: float, inner: float) -> PackedVector2Array:
	return _round_polygon(_star_points(outer, inner), outer * ROUND_RATIO)


## A rounded star badge: soft drop shadow, thick white frame, colored fill.
func _make_star(outer: float, inner: float, color: Color) -> Node2D:
	var badge := Node2D.new()

	var shadow := Polygon2D.new()
	shadow.polygon = _rounded_star(outer + STROKE_WIDTH, inner + STROKE_WIDTH)
	shadow.color = SHADOW_COLOR
	shadow.position = SHADOW_OFFSET
	badge.add_child(shadow)

	var stroke := Polygon2D.new()
	stroke.polygon = _rounded_star(outer + STROKE_WIDTH, inner + STROKE_WIDTH)
	stroke.color = Color(1, 1, 1, 1)
	badge.add_child(stroke)

	var fill := Polygon2D.new()
	fill.polygon = _rounded_star(outer, inner)
	fill.color = color
	badge.add_child(fill)

	return badge


# ----------------------------------------------------------------
#  Persistence
# ----------------------------------------------------------------
func _save() -> void:
	var cfg := ConfigFile.new()
	for level in _stars.keys():
		cfg.set_value("stars", str(level), true)
	cfg.save(SAVE_PATH)


func _load() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) != OK:
		return
	for key in cfg.get_section_keys("stars"):
		_stars[int(key)] = true


# ----------------------------------------------------------------
#  Chime (generated, zero assets — swap for a recording anytime)
# ----------------------------------------------------------------
func _play_chime() -> void:
	var player := AudioStreamPlayer.new()
	add_child(player)
	player.stream = _chime_wave()
	player.finished.connect(player.queue_free)
	player.play()


# Builds the "ta-da" chime as a real WAV buffer up front instead of
# feeding an AudioStreamGenerator live from the main thread — the
# live-push API contends with the audio mixer thread, and doing that
# for several chimes/voice lines at once (e.g. right after finishing
# a level, when this and StarChart's own chime can overlap) was able
# to hang the whole process.
func _chime_wave() -> AudioStreamWAV:
	var mix_rate := 22050
	var notes: Array[float] = [1046.5, 1568.0]   # C6 then G6
	var note_len := 0.25
	var frames_per_note := int(mix_rate * note_len)
	var data := PackedByteArray()
	data.resize(frames_per_note * notes.size() * 2)   # 16-bit mono
	var byte_idx := 0
	for freq in notes:
		for i in frames_per_note:
			var tt := float(i) / mix_rate
			var env := 1.0 - tt / note_len
			var v := sin(TAU * freq * tt) * 0.22 * env
			data.encode_s16(byte_idx, int(clampf(v, -1.0, 1.0) * 32767.0))
			byte_idx += 2
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = mix_rate
	wav.stereo = false
	wav.data = data
	return wav
