# =============================================================
#  Mouse Skills Adventure with Pip
#  CATCH ME IF YOU CAN  (unit_1_level_8 — BOSS LEVEL)
#  Skill: tracking a moving target
#
#  ART
#  - The runner is your bunny scene:
#      res://Scenes/unit1-level-8/bunny-run.tscn
#    Expected animations (adjust the consts if named differently):
#      "idle"     (standing)
#      "running"  (the chase)
#    The script checks which animations exist and falls back to
#    the first available one, so a name mismatch never crashes.
#
#  MECHANIC (per the level plan)
#  - The bunny scampers between random waypoints; when the cursor
#    gets close while fresh, it dodges away with a cheeky "whee".
#  - MERCY: after 2-3 dodges it pants, slows to half speed and
#    stops dodging — now it can be caught.
#  - SAFETY CAP: any round reaching 20 s tires it automatically.
#  - Clicking the bunny catches it (hearts + giggle). 3 catches
#    -> the global star.
#  - Pointing-hand cursor whenever the cursor is near the bunny.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 8
const CATCHES_TO_WIN := 3
const ROUND_TIME_CAP := 20.0
const IDLE_HINT_SECONDS := 8.0

const BUNNY_SCENE := preload("res://Scenes/unit1-level-8/bunny-run.tscn")
const ANIM_IDLE := "idle"
const ANIM_RUN := "walking"
# If your bunny art faces LEFT in the source frames, set this false.
const ART_FACES_RIGHT := true
const BUNNY_HEIGHT := 140.0        # on-screen height in px
const RUN_ANIM_SPEED_FRESH := 2.2  # playback multiplier at full speed
const RUN_ANIM_SPEED_TIRED := 1.1  # playback multiplier when tired

const FRESH_SPEED := 340.0
const TIRED_SPEED := 170.0
const DODGE_TRIGGER_DIST := 130.0   # cursor this close -> dodge (if fresh)
const DODGE_DASH_DIST := 240.0
const CATCH_RADIUS := 60.0
const HAND_CURSOR_DIST := 100.0

const COL_BG   := Color("fff3d6")   # warm playground yellow
const COL_TEXT := Color("9a6b2f")

# --- Custom display font, same as the other levels ---
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")

# --- Custom cursor, same on every screen ---
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

# --- Recorded voice clips ---
const VOICE_INTRO: AudioStream    = preload("res://Assets/unit1-level8/cant-catch-me.mp3")
const VOICE_CHASE: AudioStream    = preload("res://Assets/unit1-level8/chase-me.mp3")
const VOICE_TIRED: AudioStream    = preload("res://Assets/unit1-level8/pip-tired.mp3")
const VOICE_CAUGHT: AudioStream   = preload("res://Assets/unit1-level8/caught-me.mp3")
const VOICE_CHAMPION: AudioStream = preload("res://Assets/unit1-level8/champion-chaser.mp3")

enum PipState { RUNNING, DODGING, TIRED, CAUGHT }

var _catches := 0
var _state: PipState = PipState.RUNNING
var _dodges_this_round := 0
var _dodges_until_tired := 3
var _round_time := 0.0
var _finished := false

var _pip: Node2D                   # movement root
var _pip_body: Node2D              # bunny scene instance (flip/pant here)
var _pip_sprite: AnimatedSprite2D
var _body_base_scale := 1.0        # uniform scale fitting BUNNY_HEIGHT
var _waypoint := Vector2.ZERO
var _pant_tween: Tween
var _sweat: Node2D
var _hand_cursor_on := false

var _idle_timer: Timer
var _voice: AudioStreamPlayer
var _ghost: Node2D
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _current_instruction := "Chase me and CLICK when your hand touches me!"


# ----------------------------------------------------------------
#  Setup
# ----------------------------------------------------------------
func _ready() -> void:
	StarChart.hide_chart()
	Input.set_custom_mouse_cursor(HAND_CURSOR, Input.CURSOR_ARROW)
	Input.set_custom_mouse_cursor(HAND_CURSOR, Input.CURSOR_POINTING_HAND)

	randomize()
	var bg := ColorRect.new()
	bg.color = COL_BG
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	# Must ignore the mouse, or the hand cursor never shows.
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

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

	_say(VOICE_INTRO,
		"Hee hee! Bet you can't catch me! Chase me and CLICK when your hand touches me!")
	_start_round()


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null, Input.CURSOR_ARROW)
	Input.set_custom_mouse_cursor(null, Input.CURSOR_POINTING_HAND)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  Bunny (instance of the bunny-run scene)
# ----------------------------------------------------------------
func _build_bunny() -> void:
	_pip = Node2D.new()
	add_child(_pip)

	_pip_body = BUNNY_SCENE.instantiate() as Node2D
	_pip.add_child(_pip_body)

	_pip_sprite = _find_animated_sprite(_pip_body)
	assert(_pip_sprite != null, "bunny-run.tscn needs an AnimatedSprite2D")
	_pip_sprite.centered = true
	_pip_sprite.position = Vector2.ZERO

	var frame_size := Vector2(100, 100)
	var anim := _pick_anim(ANIM_IDLE)
	var tex := _pip_sprite.sprite_frames.get_frame_texture(anim, 0)
	if tex:
		frame_size = tex.get_size()
	_body_base_scale = BUNNY_HEIGHT / frame_size.y
	_pip_body.scale = Vector2.ONE * _body_base_scale

	_sweat = _build_sweat_drops()
	_sweat.visible = false
	_sweat.position = Vector2(0, -BUNNY_HEIGHT * 0.55)
	_pip.add_child(_sweat)

	_pip.position = _screen_size() * 0.5
	_play_anim(ANIM_RUN, RUN_ANIM_SPEED_FRESH)


func _find_animated_sprite(node: Node) -> AnimatedSprite2D:
	if node is AnimatedSprite2D:
		return node as AnimatedSprite2D
	for child in node.get_children():
		var found := _find_animated_sprite(child)
		if found:
			return found
	return null


func _pick_anim(wanted: String) -> String:
	# Use the wanted animation if the scene has it; otherwise fall
	# back to whatever exists, so a name mismatch never crashes.
	if _pip_sprite.sprite_frames.has_animation(wanted):
		return wanted
	var names := _pip_sprite.sprite_frames.get_animation_names()
	return names[0] if names.size() > 0 else "default"


func _play_anim(wanted: String, speed: float = 1.0) -> void:
	var anim := _pick_anim(wanted)
	if _pip_sprite.animation != anim or not _pip_sprite.is_playing():
		_pip_sprite.play(anim)
	_pip_sprite.speed_scale = speed


func _build_sweat_drops() -> Node2D:
	var s := Node2D.new()
	for k in 2:
		var drop := Polygon2D.new()
		drop.polygon = PackedVector2Array([
			Vector2(0, -6), Vector2(4, 2), Vector2(0, 5), Vector2(-4, 2)
		])
		drop.color = Color("7fc8f8")
		drop.position = Vector2(-18 + k * 36, 0)
		s.add_child(drop)
	return s


# ----------------------------------------------------------------
#  Rounds / movement / dodging / tiring
# ----------------------------------------------------------------
func _start_round() -> void:
	_state = PipState.RUNNING
	_dodges_this_round = 0
	_dodges_until_tired = 2 + (randi() % 2)   # 2 or 3 dodges
	_round_time = 0.0
	_sweat.visible = false
	_stop_panting()
	_play_anim(ANIM_RUN, RUN_ANIM_SPEED_FRESH)
	_pick_waypoint()
	_idle_timer.start()


func _pick_waypoint() -> void:
	var s := _screen_size()
	_waypoint = Vector2(
		randf_range(90.0, s.x - 90.0),
		randf_range(150.0, s.y - 90.0)
	)


func _process(delta: float) -> void:
	if _finished or _state == PipState.CAUGHT:
		return
	_round_time += delta
	var mouse := get_viewport().get_mouse_position()
	var to_mouse := mouse.distance_to(_pip.position)

	# Pointing-hand cursor when the cursor is near the bunny.
	var near := to_mouse <= HAND_CURSOR_DIST
	if near and not _hand_cursor_on:
		Input.set_default_cursor_shape(Input.CURSOR_POINTING_HAND)
	elif not near and _hand_cursor_on:
		Input.set_default_cursor_shape(Input.CURSOR_ARROW)
	_hand_cursor_on = near

	# Safety cap: never let a round drag on.
	if _state == PipState.RUNNING and _round_time >= ROUND_TIME_CAP:
		_get_tired()

	match _state:
		PipState.RUNNING:
			if to_mouse <= DODGE_TRIGGER_DIST:
				_do_dodge(mouse)
			else:
				_move_toward(_waypoint, FRESH_SPEED, delta)
				if _pip.position.distance_to(_waypoint) < 24.0:
					_pick_waypoint()
		PipState.TIRED:
			_move_toward(_waypoint, TIRED_SPEED, delta)
			if _pip.position.distance_to(_waypoint) < 24.0:
				_pick_waypoint()
		_:
			pass

	# Face the way the bunny is going (mirror the whole body).
	var dir := _waypoint.x - _pip.position.x
	if absf(dir) > 4.0:
		var facing := 1.0 if dir >= 0.0 else -1.0
		if not ART_FACES_RIGHT:
			facing = -facing
		_pip_body.scale.x = _body_base_scale * facing


func _move_toward(target: Vector2, speed: float, delta: float) -> void:
	var step := target - _pip.position
	if step.length() > 1.0:
		_pip.position += step.normalized() * minf(speed * delta, step.length())


func _do_dodge(mouse: Vector2) -> void:
	_state = PipState.DODGING
	_dodges_this_round += 1
	_play_tone(900.0, 1300.0, 0.12, 0.2)   # cheeky "wheee"

	var away := (_pip.position - mouse).normalized()
	var ang := away.angle() + randf_range(-0.9, 0.9)
	var s := _screen_size()
	var target := _pip.position + Vector2(cos(ang), sin(ang)) * DODGE_DASH_DIST
	target.x = clampf(target.x, 90.0, s.x - 90.0)
	target.y = clampf(target.y, 150.0, s.y - 90.0)

	var t := create_tween()
	t.tween_property(_pip, "position", target, 0.35)\
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	t.tween_callback(func () -> void:
		if _dodges_this_round >= _dodges_until_tired:
			_get_tired()
		else:
			_state = PipState.RUNNING
			_pick_waypoint()
	)


func _get_tired() -> void:
	if _state == PipState.TIRED:
		return
	_state = PipState.TIRED
	_sweat.visible = true
	_say(VOICE_TIRED, "Phew... phew... Pip is tired! Catch him now!")
	_play_anim(ANIM_RUN, RUN_ANIM_SPEED_TIRED)
	_start_panting()
	_pick_waypoint()


func _start_panting() -> void:
	_stop_panting()
	_pant_tween = create_tween().set_loops()
	_pant_tween.tween_property(_pip_body, "scale:y", _body_base_scale * 0.9, 0.22)\
		.set_trans(Tween.TRANS_SINE)
	_pant_tween.tween_property(_pip_body, "scale:y", _body_base_scale, 0.22)\
		.set_trans(Tween.TRANS_SINE)


func _stop_panting() -> void:
	if _pant_tween:
		_pant_tween.kill()
	_pip_body.scale.y = _body_base_scale


# ----------------------------------------------------------------
#  Clicks: the catch
# ----------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		_idle_timer.start()
		_hide_ghost()
		return
	if _finished or not (event is InputEventMouseButton):
		return
	var mb := event as InputEventMouseButton
	if not mb.pressed or mb.button_index != MOUSE_BUTTON_LEFT:
		return
	_idle_timer.start()
	_hide_ghost()

	if _state == PipState.CAUGHT:
		return
	if mb.position.distance_to(_pip.position) <= CATCH_RADIUS:
		_do_catch(mb.position)
	# Missed clicks do nothing — a fresh bunny may already have
	# dodged out from under them, and that's the joke, not a fail.


func _do_catch(at: Vector2) -> void:
	_state = PipState.CAUGHT
	_idle_timer.stop()
	_catches += 1
	_stop_panting()
	_sweat.visible = false
	_play_anim(ANIM_IDLE, 1.0)

	# Giggle + hug: the bunny hops onto the cursor spot, hearts pop.
	_play_tone(700.0, 1100.0, 0.1, 0.25)
	_play_tone_delayed(900.0, 1300.0, 0.1, 0.25, 0.12)
	_burst_hearts(at)

	var t := create_tween()
	t.tween_property(_pip, "position", at, 0.2)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	await t.finished

	if _catches >= CATCHES_TO_WIN:
		_finish_level()
	else:
		_say(VOICE_CAUGHT, "You caught me! Again, again!")
		await _voice.finished
		await get_tree().create_timer(0.3).timeout
		# The bunny wriggles free and the chase restarts.
		var s := _screen_size()
		var flee := Vector2(randf_range(90.0, s.x - 90.0), randf_range(150.0, s.y - 90.0))
		_play_anim(ANIM_RUN, RUN_ANIM_SPEED_FRESH)
		var t2 := create_tween()
		t2.tween_property(_pip, "position", flee, 0.5)\
			.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		await t2.finished
		_start_round()


func _burst_hearts(pos: Vector2) -> void:
	for k in 5:
		var heart := Polygon2D.new()
		heart.polygon = PackedVector2Array([
			Vector2(0, 3), Vector2(-6, -3), Vector2(-3, -7), Vector2(0, -4),
			Vector2(3, -7), Vector2(6, -3)
		])
		heart.color = Color("ef476f")
		heart.position = pos
		add_child(heart)
		var ang := randf_range(-PI, 0.0)
		var t := create_tween()
		t.tween_property(heart, "position",
			pos + Vector2(cos(ang), sin(ang)) * randf_range(50.0, 100.0), 0.8)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		t.parallel().tween_property(heart, "modulate:a", 0.0, 0.8)
		t.tween_callback(heart.queue_free)


# ----------------------------------------------------------------
#  Finish + star (handled by the global StarChart autoload)
# ----------------------------------------------------------------
func _finish_level() -> void:
	_finished = true
	Input.set_default_cursor_shape(Input.CURSOR_ARROW)
	_say(VOICE_CHAMPION, "You caught me three times! You're the champion chaser!")
	# Let the whole clip play before the star celebration starts.
	await _voice.finished
	await get_tree().create_timer(0.3).timeout
	StarChart.show_chart(StarChart.UNIT_1_LEVELS)
	await StarChart.add_star(LEVEL_NUMBER)
	level_completed.emit(LEVEL_NUMBER)
	get_tree().change_scene_to_file("res://Scenes/unit1-level9.tscn")


# ----------------------------------------------------------------
#  Idle hint: ghost cursor chases the bunny
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
	if _finished or _state == PipState.CAUGHT:
		return
	_say(VOICE_CHASE, _current_instruction)
	_ghost.visible = true
	_ghost.position = get_viewport().get_mouse_position()
	var t := create_tween()
	t.tween_property(_ghost, "position", _pip.position, 1.2)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	t.tween_property(_ghost, "scale", Vector2.ONE * 0.75, 0.12)
	t.tween_property(_ghost, "scale", Vector2.ONE, 0.12)
	t.tween_interval(0.3)
	t.tween_callback(_hide_ghost)
	_idle_timer.start()


func _hide_ghost() -> void:
	if _ghost:
		_ghost.visible = false
		_ghost.scale = Vector2.ONE


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
	_instruction_label.add_theme_color_override("font_outline_color", Color("5a4a6b"))
	_instruction_label.add_theme_constant_override("outline_size", 10)
	_instruction_label.add_theme_constant_override("line_separation", 28)
	# Just below the star badge row, with breathing room.
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
	_speaker_btn.pressed.connect(func () -> void: _say(VOICE_CHASE, _current_instruction))
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


func _play_tone_delayed(freq_start: float, freq_end: float, dur: float, vol: float, delay: float) -> void:
	get_tree().create_timer(delay).timeout.connect(
		func () -> void: _play_tone(freq_start, freq_end, dur, vol)
	)
