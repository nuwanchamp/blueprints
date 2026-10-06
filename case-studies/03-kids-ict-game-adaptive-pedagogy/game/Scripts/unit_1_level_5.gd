# =============================================================
#  Mouse Skills Adventure with Pip
#  FOLLOW THE TRAIL  (BunnyWalk edition)
#  Skill: controlled, continuous movement
#
#  The guide character is your animated bunny scene:
#      res://Scenes/bunny-walk.tscn   <- ADJUST PATH IF NEEDED
#  Expected: an AnimatedSprite2D with animations
#      "idle"     (standing/waiting)
#      "walking"  (trotting along)
#  The script copes whether the sprite is the scene root or a child.
#
#  - Bunny plays "walking" while it moves along the path and
#    "idle" whenever it stops (child off the path / waiting).
#  - Bunny flips to face the direction it is walking.
#  - Star awarding uses the GLOBAL StarChart autoload.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

# NOTE: set to this level's slot in StarChart.LEVELS.
# In your project numbering (unit_1_level_5) that is 5.
const LEVEL_NUMBER := 5

const BUNNY_SCENE := preload("res://Scenes/bunny-walk.tscn")
const ANIM_IDLE := "idle"
const ANIM_WALK := "walking"
# If your bunny art faces LEFT in the source frames, set this false.
const ART_FACES_RIGHT := true
# Bunny height on screen, relative to the path width of the round.
const BUNNY_HEIGHT_FACTOR := 1.6
# Animation playback multiplier while walking. Your walk cycle is
# authored at 5 FPS; 3.0 plays it at an effective 15 FPS so the
# legs keep up with the movement speed. Tune together with PIP_SPEED
# until the feet stop sliding.
const WALK_ANIM_SPEED := 3.0

# Path width per round, in pixels (cursor is roughly 24-30 px).
const ROUND_WIDTHS: Array[float] = [90.0, 72.0, 56.0]
const PIP_LEAD := 110.0          # how far ahead of the child the bunny walks
const PIP_SPEED := 200.0         # max px/second along the path
const PROGRESS_WINDOW := 140.0   # max forward jump accepted per frame
const IDLE_HINT_SECONDS := 8.0

const COL_BG    := Color("cfe8cf")   # grassy meadow
const COL_MUD   := Color("b08968")
const COL_PATH  := Color("ffd166")   # the yellow path
const COL_EDGE  := Color("e0a800")
const COL_TEXT  := Color("4a6b4a")

# --- Custom display font, same as the Corner Homes level ---
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")

# --- Custom cursor, same on every screen ---
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

# --- Recorded voice clips (verify names via right-click > Copy Path) ---
const VOICE_INTRO: AudioStream   = preload("res://Assets/unit1-level5/walk-whith-me.mp3")
const VOICE_YOUDIDIT: AudioStream = preload("res://Assets/unit1-level5/youdidit.mp3")
const VOICE_WIGGLY: AudioStream  = preload("res://Assets/unit1-level5/wiggly-path.mp3")
const VOICE_ZIGZAG: AudioStream  = preload("res://Assets/unit1-level5/zigzag.mp3")
const VOICE_WHOLE: AudioStream   = preload("res://Assets/unit1-level5/walk-whole.mp3")

# --- Flag image at the end of paths 1 and 2 ---
# Set to the exact filename in your folder (right-click > Copy Path).
const FLAG_PATH := "res://Assets/unit1-level5/flag.png"
const FLAG_HEIGHT := 90.0   # on-screen height in px

# --- House at the finish line of the last (zigzag) path ---
const HOUSE_FINISH: Texture2D = preload("res://Assets/bunny-house/house-cloased.png")
const HOUSE_HEIGHT := 150.0  # on-screen height in px

# Ribbon length in PIXELS OF MOVEMENT — the same visible trail at
# any mouse speed. Fading over time happens only when the mouse rests.
const TRAIL_LENGTH := 220.0

var _round := 0
var _curve: Curve2D
var _child_progress := 0.0       # child's distance along the curve (px)
var _pip_progress := 0.0
var _on_path := false
var _was_on_path := true
var _finishing := false

var _path_line: Line2D
var _edge_line: Line2D
var _mud_line: Line2D
var _pip: Node2D                 # BunnyWalk scene instance
var _pip_sprite: AnimatedSprite2D
var _pip_frame_size := Vector2(100, 100)
var _trail: Line2D               # rainbow ribbon — only ON the path
var _trail_points: PackedVector2Array = PackedVector2Array()
var _trail_white: Line2D         # plain white ribbon — everywhere
var _white_points: PackedVector2Array = PackedVector2Array()
var _trail_decay := 0.0          # timer for fading both trail tails
var _sparkles: CPUParticles2D    # rainbow sparkles behind the cursor
var _last_mouse := Vector2.ZERO
var _goal: Node2D

var _idle_timer: Timer
var _voice: AudioStreamPlayer   # plays the recorded narration clips
var _ghost: Node2D
var _instruction_label: RichTextLabel   # rainbow BBCode text
var _speaker_btn: Button
var _current_instruction := "Walk with me! Stay on the yellow path!"


# ----------------------------------------------------------------
#  Setup
# ----------------------------------------------------------------
func _ready() -> void:
	StarChart.hide_chart()
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

	_mud_line = Line2D.new()
	_mud_line.default_color = COL_MUD
	_mud_line.joint_mode = Line2D.LINE_JOINT_ROUND
	_mud_line.begin_cap_mode = Line2D.LINE_CAP_ROUND
	_mud_line.end_cap_mode = Line2D.LINE_CAP_ROUND
	add_child(_mud_line)

	_edge_line = Line2D.new()
	_edge_line.default_color = COL_EDGE
	_edge_line.joint_mode = Line2D.LINE_JOINT_ROUND
	_edge_line.begin_cap_mode = Line2D.LINE_CAP_ROUND
	_edge_line.end_cap_mode = Line2D.LINE_CAP_ROUND
	add_child(_edge_line)

	_path_line = Line2D.new()
	_path_line.default_color = COL_PATH
	_path_line.joint_mode = Line2D.LINE_JOINT_ROUND
	_path_line.begin_cap_mode = Line2D.LINE_CAP_ROUND
	_path_line.end_cap_mode = Line2D.LINE_CAP_ROUND
	add_child(_path_line)

	# Plain white ribbon: follows the mouse EVERYWHERE, fading tail.
	# This is the "way back" trail; drawn under the rainbow one.
	_trail_white = Line2D.new()
	_trail_white.width = 8.0
	_trail_white.joint_mode = Line2D.LINE_JOINT_ROUND
	_trail_white.begin_cap_mode = Line2D.LINE_CAP_ROUND
	_trail_white.end_cap_mode = Line2D.LINE_CAP_ROUND
	var white_fade := Gradient.new()
	white_fade.set_color(0, Color(1, 1, 1, 0.0))
	white_fade.set_color(1, Color(1, 1, 1, 0.7))
	_trail_white.gradient = white_fade
	add_child(_trail_white)

	_trail = Line2D.new()
	_trail.width = 24.0
	_trail.joint_mode = Line2D.LINE_JOINT_ROUND
	_trail.begin_cap_mode = Line2D.LINE_CAP_ROUND
	_trail.end_cap_mode = Line2D.LINE_CAP_ROUND
	# A true rainbow RIBBON: the spectrum runs ACROSS the trail's
	# width (like a real rainbow), via a vertical gradient texture —
	# Line2D maps the texture's vertical axis across its width.
	var band := Gradient.new()
	band.set_color(0, Color("ff5a5a"))      # red edge
	band.add_point(0.2, Color("ffb648"))    # orange
	band.add_point(0.4, Color("ffe45a"))    # yellow
	band.add_point(0.6, Color("5ad18a"))    # green
	band.add_point(0.8, Color("58a6ff"))    # blue
	band.set_color(1, Color("b06bff"))      # violet edge
	var band_tex := GradientTexture2D.new()
	band_tex.gradient = band
	band_tex.fill_from = Vector2(0, 0)
	band_tex.fill_to = Vector2(0, 1)        # colors run top-to-bottom
	_trail.texture = band_tex
	_trail.texture_mode = Line2D.LINE_TEXTURE_STRETCH
	# Along the LENGTH: pure alpha fade so the tail melts away.
	var fade := Gradient.new()
	fade.set_color(0, Color(1, 1, 1, 0.0))      # invisible tail
	fade.add_point(0.55, Color(1, 1, 1, 0.55))
	fade.set_color(1, Color(1, 1, 1, 0.85))     # strong at the cursor
	_trail.gradient = fade
	add_child(_trail)

	# Sparkles that pop off the cursor while it moves along the path.
	_sparkles = CPUParticles2D.new()
	_sparkles.emitting = false
	_sparkles.amount = 50
	_sparkles.lifetime = 0.7
	_sparkles.local_coords = false      # sparkles linger where they spawned
	_sparkles.spread = 180.0
	_sparkles.initial_velocity_min = 15.0
	_sparkles.initial_velocity_max = 55.0
	_sparkles.gravity = Vector2(0, -30) # gentle upward drift
	_sparkles.scale_amount_min = 1.5
	_sparkles.scale_amount_max = 3.5
	_sparkles.color = Color(1.0, 0.3, 0.3)
	_sparkles.hue_variation_min = -1.0  # full rainbow of hues
	_sparkles.hue_variation_max = 1.0
	var twinkle := Gradient.new()       # sparkles fade as they die
	twinkle.set_color(0, Color(1, 1, 1, 1))
	twinkle.set_color(1, Color(1, 1, 1, 0))
	_sparkles.color_ramp = twinkle
	add_child(_sparkles)

	_goal = Node2D.new()
	add_child(_goal)

	_build_bunny()

	_build_ui()
	_build_ghost_cursor()

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say(VOICE_INTRO, "Walk with me! Stay on the yellow path — don't step in the mud!")
	await get_tree().create_timer(2.0).timeout
	_start_round(0)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null, Input.CURSOR_ARROW)
	Input.set_custom_mouse_cursor(null, Input.CURSOR_POINTING_HAND)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  Bunny (instance of the BunnyWalk scene)
# ----------------------------------------------------------------
func _build_bunny() -> void:
	_pip = BUNNY_SCENE.instantiate() as Node2D
	add_child(_pip)

	_pip_sprite = _find_animated_sprite(_pip)
	assert(_pip_sprite != null, "bunny-walk.tscn needs an AnimatedSprite2D")
	_pip_sprite.centered = true
	# Zero any editor-placed offset inside the scene, so the bunny's
	# middle sits exactly on the curve point we move it to.
	_pip_sprite.position = Vector2.ZERO

	var tex := _pip_sprite.sprite_frames.get_frame_texture(ANIM_IDLE, 0)
	if tex:
		_pip_frame_size = tex.get_size()

	# Feet on the line: lift the sprite by half its own height so the
	# BOTTOM of the bunny sits exactly on the path centerline. offset
	# is in texture pixels, so it scales with the bunny automatically.
	_pip_sprite.offset = Vector2(0, -_pip_frame_size.y * 0.5)

	_pip_sprite.play(ANIM_IDLE)
	# Stay hidden until _start_round() places the bunny on the path —
	# prevents a flash of the unpositioned sprite during the intro.
	_pip.visible = false


func _find_animated_sprite(node: Node) -> AnimatedSprite2D:
	if node is AnimatedSprite2D:
		return node as AnimatedSprite2D
	for child in node.get_children():
		var found := _find_animated_sprite(child)
		if found:
			return found
	return null


func _fit_bunny_to_round(r: int) -> void:
	# Scale the bunny so its height suits the path width this round.
	var target_h := ROUND_WIDTHS[r] * BUNNY_HEIGHT_FACTOR
	_pip.scale = Vector2.ONE * (target_h / _pip_frame_size.y)


func _set_bunny_walking(walking: bool) -> void:
	var want := ANIM_WALK if walking else ANIM_IDLE
	if _pip_sprite.animation != want:
		_pip_sprite.play(want)
	_pip_sprite.speed_scale = WALK_ANIM_SPEED if walking else 1.0


func _face_bunny_along_path() -> void:
	# Look a little ahead on the curve to find the walk direction.
	var ahead := _curve.sample_baked(minf(_pip_progress + 6.0, _curve.get_baked_length()))
	var dx := ahead.x - _pip.position.x
	if absf(dx) > 0.5:
		var moving_right := dx > 0.0
		_pip_sprite.flip_h = (moving_right != ART_FACES_RIGHT)


# ----------------------------------------------------------------
#  Paths (normalized 0..1 points, scaled to the screen)
# ----------------------------------------------------------------
func _round_curve(r: int) -> Curve2D:
	var s := _screen_size()
	var m := 90.0   # margin so the path stays clear of screen edges
	var w := s.x - 2.0 * m
	var h := s.y - 2.0 * m

	var c := Curve2D.new()
	c.bake_interval = 8.0

	if r == 0:
		# Gentle single arc, left to right.
		c.add_point(Vector2(m, m + h * 0.75), Vector2.ZERO, Vector2(w * 0.3, -h * 0.55))
		c.add_point(Vector2(m + w, m + h * 0.6), Vector2(-w * 0.3, -h * 0.45), Vector2.ZERO)
	elif r == 1:
		# S-curve.
		c.add_point(Vector2(m, m + h * 0.85), Vector2.ZERO, Vector2(w * 0.35, 0))
		c.add_point(Vector2(m + w * 0.5, m + h * 0.5), Vector2(-w * 0.25, 0), Vector2(w * 0.25, 0))
		c.add_point(Vector2(m + w, m + h * 0.15), Vector2(-w * 0.35, 0), Vector2.ZERO)
	else:
		# Zigzag with softly rounded corners.
		var xs: Array[float] = [0.0, 0.25, 0.5, 0.75, 1.0]
		var ys: Array[float] = [0.85, 0.25, 0.8, 0.2, 0.7]
		for k in xs.size():
			var pt := Vector2(m + w * xs[k], m + h * ys[k])
			var handle := Vector2(w * 0.06, 0)
			c.add_point(pt, -handle, handle)
	return c


func _start_round(r: int) -> void:
	_round = r
	_finishing = false
	_curve = _round_curve(r)
	_child_progress = 0.0
	_pip_progress = 0.0
	_was_on_path = true
	_trail_points.clear()
	_trail.points = _trail_points
	_white_points.clear()
	_trail_white.points = _white_points

	var baked := _curve.get_baked_points()
	var width := ROUND_WIDTHS[r]
	_mud_line.points = baked
	_mud_line.width = width + 34.0
	_edge_line.points = baked
	_edge_line.width = width + 10.0
	_path_line.points = baked
	_path_line.width = width

	_place_goal(r)
	_fit_bunny_to_round(r)
	_pip.position = _curve.sample_baked(0.0)
	_pip.visible = true
	_set_bunny_walking(false)
	_face_bunny_along_path()
	_idle_timer.start()

	if r == 1:
		_say(VOICE_WIGGLY, "A wiggly path! Stay with me!")
	elif r == 2:
		_say(VOICE_ZIGZAG, "Last one — a zigzag! You can do it!")


func _place_goal(r: int) -> void:
	for child in _goal.get_children():
		child.queue_free()
	var end_pos := _curve.sample_baked(_curve.get_baked_length())
	_goal.position = end_pos

	if r < 2:
		# Your flag image marks the end of paths 1 and 2. Loaded at
		# runtime so a wrong filename falls back to the drawn flag
		# instead of breaking the level.
		var tex := load(FLAG_PATH) as Texture2D
		if tex:
			var spr := Sprite2D.new()
			spr.texture = tex
			spr.centered = true
			var ts := tex.get_size()
			spr.scale = Vector2.ONE * (FLAG_HEIGHT / ts.y)
			# Base of the flag stands on the path end point.
			spr.offset = Vector2(0, -ts.y * 0.5)
			_goal.add_child(spr)
		else:
			var pole := Line2D.new()
			pole.width = 4.0
			pole.default_color = Color("6b4f3a")
			pole.points = PackedVector2Array([Vector2(0, 0), Vector2(0, -46)])
			_goal.add_child(pole)
			var flag := Polygon2D.new()
			flag.polygon = PackedVector2Array([
				Vector2(0, -46), Vector2(34, -38), Vector2(0, -30)
			])
			flag.color = Color("ff6b6b")
			_goal.add_child(flag)
	else:
		# The bunny's house waits at the end of the last path.
		var house := Sprite2D.new()
		house.texture = HOUSE_FINISH
		house.centered = true
		var hs := HOUSE_FINISH.get_size()
		house.scale = Vector2.ONE * (HOUSE_HEIGHT / hs.y)
		# Base of the house stands on the path end point.
		house.offset = Vector2(0, -hs.y * 0.5)
		_goal.add_child(house)


# ----------------------------------------------------------------
#  Main loop
# ----------------------------------------------------------------
func _process(delta: float) -> void:
	if _curve == null or _finishing:
		return

	var mouse := get_viewport().get_mouse_position()
	var closest := _curve.get_closest_point(mouse)
	var offset := _curve.get_closest_offset(mouse)
	var dist := mouse.distance_to(closest)
	_on_path = dist <= ROUND_WIDTHS[_round] * 0.5

	# Squish on the moment the child steps into the mud; note the
	# moment they come back so the rainbow can start fresh there.
	var entered_path := _on_path and not _was_on_path
	if _was_on_path and not _on_path:
		_play_squish()
	_was_on_path = _on_path

	# --- Two ribbons + sparkles ---
	# WHITE ribbon: follows the mouse everywhere (mud included).
	# RAINBOW ribbon + sparkles: only while ON the path. Re-entering
	# the path starts a fresh rainbow so it never streaks across mud.
	var last := _last_mouse
	_last_mouse = mouse
	var frame_moved := mouse.distance_to(last) > 0.5
	if entered_path:
		_trail_points.clear()
	if frame_moved:
		# Spacing measured from the last APPENDED point, so slow,
		# careful movement still accumulates and draws.
		if _white_points.is_empty() \
				or mouse.distance_to(_white_points[_white_points.size() - 1]) > 5.0:
			_white_points.append(mouse)
		if _on_path and (_trail_points.is_empty()
				or mouse.distance_to(_trail_points[_trail_points.size() - 1]) > 5.0):
			_trail_points.append(mouse)
		# Cap by DISTANCE, not by point count or time — the visible
		# ribbon is the last TRAIL_LENGTH px of movement, whatever
		# the mouse speed.
		while _white_points.size() > 1 and _polyline_len(_white_points) > TRAIL_LENGTH:
			_white_points.remove_at(0)
		while _trail_points.size() > 1 and _polyline_len(_trail_points) > TRAIL_LENGTH:
			_trail_points.remove_at(0)
	if _on_path and frame_moved:
		_sparkles.position = mouse
		_sparkles.emitting = true
	else:
		_sparkles.emitting = false
	# Time-fade ONLY while the mouse rests: the ribbon melts away
	# a moment after the child stops moving.
	if frame_moved:
		_trail_decay = 0.0
	else:
		_trail_decay += delta
		while _trail_decay >= 0.03:
			_trail_decay -= 0.03
			if _trail_points.size() > 0:
				_trail_points.remove_at(0)
			if _white_points.size() > 0:
				_white_points.remove_at(0)
	_trail.points = _trail_points if _trail_points.size() >= 2 else PackedVector2Array()
	_trail_white.points = _white_points if _white_points.size() >= 2 else PackedVector2Array()

	# Progress only advances while on the path, and never by a huge
	# jump — so cutting across a zigzag fold doesn't skip ahead.
	if _on_path and offset > _child_progress and offset - _child_progress < PROGRESS_WINDOW:
		_child_progress = offset

	# The bunny walks toward a point a little ahead of the child,
	# but only while the child is on the path; otherwise it stops,
	# switches to "idle", and waits.
	var length := _curve.get_baked_length()
	var target: float = min(_child_progress + PIP_LEAD, length)
	var moving := _on_path and _pip_progress < target
	if moving:
		_pip_progress = min(_pip_progress + PIP_SPEED * delta, target)
	_pip.position = _curve.sample_baked(_pip_progress)
	_set_bunny_walking(moving)
	_face_bunny_along_path()

	# Level goal: the child (not just the bunny) reaches the end.
	if _child_progress >= length - 30.0:
		_on_path_finished()


func _polyline_len(pts: PackedVector2Array) -> float:
	var total := 0.0
	for i in range(1, pts.size()):
		total += pts[i - 1].distance_to(pts[i])
	return total


func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		_idle_timer.start()
		_hide_ghost()


func _on_path_finished() -> void:
	_finishing = true
	_idle_timer.stop()
	_hide_ghost()
	# The ribbons and sparkles vanish with the finished path — the
	# decay loop stops running while _finishing, so clear them now.
	_trail_points.clear()
	_trail.points = PackedVector2Array()
	_white_points.clear()
	_trail_white.points = PackedVector2Array()
	_sparkles.emitting = false
	if _round < ROUND_WIDTHS.size() - 1:
		_set_bunny_walking(false)
		_say(VOICE_YOUDIDIT, "You did it! Here comes the next path!")
		# Let the whole clip play before the next round's clip starts.
		await _voice.finished
		await get_tree().create_timer(0.4).timeout
		_start_round(_round + 1)
	else:
		_say(VOICE_WHOLE, "Home at last! You walked the whole trail!")
		_set_bunny_walking(true)
		var hop := create_tween()
		hop.tween_property(_pip, "position", _goal.position + Vector2(-40, -10), 0.6)\
			.set_trans(Tween.TRANS_SINE)
		await hop.finished
		_set_bunny_walking(false)
		_award_star()


# ----------------------------------------------------------------
#  Star + level end (handled by the global StarChart autoload)
# ----------------------------------------------------------------
func _award_star() -> void:
	StarChart.show_chart(StarChart.UNIT_1_LEVELS)
	await StarChart.add_star(LEVEL_NUMBER)
	level_completed.emit(LEVEL_NUMBER)
	get_tree().change_scene_to_file("res://Scenes/unit1-level6.tscn")


# ----------------------------------------------------------------
#  Idle hint (ghost cursor slides back onto the path)
# ----------------------------------------------------------------
func _build_ghost_cursor() -> void:
	_ghost = Node2D.new()
	var arrow := Polygon2D.new()
	arrow.polygon = PackedVector2Array([
		Vector2(0, 0), Vector2(0, 26), Vector2(7, 20),
		Vector2(12, 30), Vector2(16, 28), Vector2(11, 18), Vector2(19, 17)
	])
	arrow.color = Color(0.4, 0.4, 0.9, 0.5)
	_ghost.add_child(arrow)
	_ghost.visible = false
	_ghost.z_index = 100
	add_child(_ghost)


func _on_idle_hint() -> void:
	if _curve == null or _finishing:
		return
	_say(VOICE_INTRO, _current_instruction)
	_ghost.visible = true
	_ghost.position = get_viewport().get_mouse_position()
	# The ghost glides to the child's spot on the path, then a bit
	# further along it, showing "come here, then walk this way".
	var here := _curve.sample_baked(_child_progress)
	var ahead := _curve.sample_baked(min(_child_progress + 160.0, _curve.get_baked_length()))
	var t := create_tween()
	t.tween_property(_ghost, "position", here, 1.0)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	t.tween_property(_ghost, "position", ahead, 1.0)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	t.tween_interval(0.3)
	t.tween_callback(_hide_ghost)
	_idle_timer.start()


func _hide_ghost() -> void:
	if _ghost:
		_ghost.visible = false


# ----------------------------------------------------------------
#  UI: one short text line + speaker button
# ----------------------------------------------------------------
func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)

	_instruction_label = RichTextLabel.new()
	_instruction_label.bbcode_enabled = true
	_instruction_label.fit_content = true
	_instruction_label.scroll_active = false
	_instruction_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_instruction_label.add_theme_font_override("normal_font", UI_FONT)
	_instruction_label.add_theme_font_size_override("normal_font_size", 34)
	# Soft dark outline keeps rainbow text readable on pastel backgrounds.
	_instruction_label.add_theme_color_override("font_outline_color", Color("5a4a6b"))
	_instruction_label.add_theme_constant_override("outline_size", 10)
	_instruction_label.add_theme_constant_override("line_separation", 28)
	# Anchored just below the star badge row, with breathing room.
	_instruction_label.anchor_left = 0.05
	_instruction_label.anchor_right = 0.95
	_instruction_label.anchor_top = 0.1
	_instruction_label.anchor_bottom = 0.2
	layer.add_child(_instruction_label)

	_speaker_btn = Button.new()
	_speaker_btn.text = "🔊"
	_speaker_btn.add_theme_font_size_override("font_size", 30)
	_speaker_btn.anchor_left = 0.0
	_speaker_btn.anchor_top = 1.0
	_speaker_btn.offset_left = 16
	_speaker_btn.offset_top = -76
	_speaker_btn.offset_right = 76
	_speaker_btn.offset_bottom = -16
	_speaker_btn.pressed.connect(func () -> void: _say(VOICE_INTRO, _current_instruction))
	layer.add_child(_speaker_btn)


# ----------------------------------------------------------------
#  Narration: recorded voice clips (audio-first), text line synced
# ----------------------------------------------------------------
func _say(clip: AudioStream, text: String) -> void:
	_instruction_label.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ text
		+ "[/rainbow][/center]"
	)
	_voice.stop()               # never overlap two voice lines
	_voice.stream = clip
	_voice.play()


# ----------------------------------------------------------------
#  Sounds (generated, zero assets)
# ----------------------------------------------------------------
func _play_squish() -> void:
	# Soft low "squish" — falling pitch, quiet, never scary.
	_play_tone(300.0, 120.0, 0.25, 0.15)


func _play_tone(freq_start: float, freq_end: float, dur: float, vol: float) -> void:
	var player := AudioStreamPlayer.new()
	add_child(player)
	player.stream = _tone_wave(freq_start, freq_end, dur, vol)
	player.finished.connect(player.queue_free)
	player.play()


# Builds the tone as a real WAV buffer up front instead of feeding an
# AudioStreamGenerator live from the main thread — the live-push API
# contends with the audio mixer thread, and several tones/voice lines
# starting at once (e.g. right after finishing a level) was able to
# hang the whole process.
func _tone_wave(freq_start: float, freq_end: float, dur: float, vol: float) -> AudioStreamWAV:
	var mix_rate := 22050
	var frames := int(mix_rate * dur)
	var data := PackedByteArray()
	data.resize(frames * 2)   # 16-bit mono
	var byte_idx := 0
	for i in frames:
		var tt := float(i) / mix_rate
		var k := tt / dur
		var freq := lerpf(freq_start, freq_end, k)
		var env := 1.0 - k
		var v := sin(TAU * freq * tt) * vol * env
		data.encode_s16(byte_idx, int(clampf(v, -1.0, 1.0) * 32767.0))
		byte_idx += 2
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = mix_rate
	wav.stereo = false
	wav.data = data
	return wav
