# =============================================================
#  Mouse Skills Adventure with Pip
#  BUBBLE POP PARTY  (unit_1_level_7)
#  Skill: click and aim combined
#
#  ART
#  - Toys inside the bubbles are your PNGs from
#      res://Assets/unit1-level7/toys_*.png
#  - The bottom-corner character is your puppy-with-cart scene:
#      res://Scenes/puppy-walk-with-toys.tscn   <- ADJUST PATH
#    Expected: an AnimatedSprite2D with animations
#      "idle"     (standing with the cart)
#      "walking"  (pulling the cart along)
#
#  MECHANIC
#  - Toy-filled bubbles drift up with a gentle sway; clicking one
#    pops it and the toy drops down beside the puppy's cart.
#  - Hidden progression: bubbles shrink ~90 -> ~55 px radius and
#    speed up slightly across the 12 pops.
#  - Misclicks do nothing; escaped bubbles wrap around from the
#    bottom — nothing is ever lost.
#  - FINALE: after 12 pops the puppy plays "walking" and pulls
#    the cart off-screen, then the global star is awarded.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 7
const POPS_TO_WIN := 12
const MAX_BUBBLES := 4
const IDLE_HINT_SECONDS := 8.0

# Hidden progression, interpolated by pops done (0.0 -> 1.0).
const RADIUS_START := 90.0
const RADIUS_END := 55.0
const SPEED_START := 45.0
const SPEED_END := 95.0

const COL_BG   := Color("d9f0f7")   # bright bath-time blue
const COL_TEXT := Color("2a6b8a")

# --- Custom display font, same as the other levels ---
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")

# --- Custom cursor, same on every screen ---
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

# --- Recorded voice clips ---
const VOICE_INTRO: AudioStream = preload("res://Assets/unit1-level7/pop-the-bubbles.mp3")
const VOICE_LOOK: AudioStream  = preload("res://Assets/unit1-level7/look-all-the-toys.mp3")
const VOICE_FREE: AudioStream  = preload("res://Assets/unit1-level7/toys-are-free.mp3")

# --- Toy art shown inside the bubbles ---
const TOY_TEXTURES: Array[Texture2D] = [
	preload("res://Assets/unit1-level7/toys_03.png"),
	preload("res://Assets/unit1-level7/toys_05.png"),
	preload("res://Assets/unit1-level7/toys_07.png"),
	preload("res://Assets/unit1-level7/toys_10.png"),
	preload("res://Assets/unit1-level7/toys_13.png"),
]

# --- Puppy with the toy cart (finale character) ---
const PUPPY_SCENE := preload("res://Scenes/unit1-level-7/Puppy-walk-with-toys.tscn")
const ANIM_IDLE := "idle"
const ANIM_WALK := "walking"
const PUPPY_HEIGHT := 180.0     # on-screen height in px
const WALK_ANIM_SPEED := 1.6    # playback multiplier while walking
const WALK_OFF_SECONDS := 4.5   # how long the farewell walk takes
# Where popped toys pile up, relative to the puppy sprite's CENTRE,
# as a FRACTION of the frame size (x: rightward, y: downward).
# (0.28, 0.32) ≈ the wagon bed at the bottom-right of your art.
# Tune by eye: bigger y = lower, bigger x = further right.
const CART_OFFSET_FRAC := Vector2(0.28, 0.32)

var _pops := 0
var _bubbles: Array[Dictionary] = []   # {node, tex, radius, speed, sway_phase, base_x}
var _puppy: Node2D
var _puppy_sprite: AnimatedSprite2D
var _puppy_frame_size := Vector2(100, 100)
var _puppy_scale := 1.0
var _dropped_toys: Node2D
var _finished := false

var _idle_timer: Timer
var _voice: AudioStreamPlayer   # ready for recorded clips
var _ghost: Node2D
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _current_instruction := "Pop the bubbles and set the toys free!"
var _time := 0.0


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
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

	_dropped_toys = Node2D.new()
	add_child(_dropped_toys)

	_build_puppy()
	_build_ui()
	_build_ghost_cursor()

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say(VOICE_INTRO, "Pop the bubbles and set the toys free!")
	_idle_timer.start()

	for k in MAX_BUBBLES:
		_spawn_bubble(true)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null, Input.CURSOR_ARROW)
	Input.set_custom_mouse_cursor(null, Input.CURSOR_POINTING_HAND)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


func _progress() -> float:
	return clampf(float(_pops) / float(POPS_TO_WIN - 1), 0.0, 1.0)


# ----------------------------------------------------------------
#  Puppy with the toy cart (instance of your scene)
# ----------------------------------------------------------------
func _build_puppy() -> void:
	_puppy = PUPPY_SCENE.instantiate() as Node2D
	add_child(_puppy)

	_puppy_sprite = _find_animated_sprite(_puppy)
	assert(_puppy_sprite != null, "puppy scene needs an AnimatedSprite2D")
	_puppy_sprite.centered = true
	_puppy_sprite.position = Vector2.ZERO

	var tex := _puppy_sprite.sprite_frames.get_frame_texture(ANIM_IDLE, 0)
	if tex:
		_puppy_frame_size = tex.get_size()

	_puppy_scale = PUPPY_HEIGHT / _puppy_frame_size.y
	_puppy.scale = Vector2.ONE * _puppy_scale

	var s := _screen_size()
	# Bottom-right corner, feet near the bottom edge.
	_puppy.position = Vector2(s.x - 160.0, s.y - PUPPY_HEIGHT * 0.55)

	_puppy_sprite.play(ANIM_IDLE)


func _find_animated_sprite(node: Node) -> AnimatedSprite2D:
	if node is AnimatedSprite2D:
		return node as AnimatedSprite2D
	for child in node.get_children():
		var found := _find_animated_sprite(child)
		if found:
			return found
	return null


func _toy_drop_point() -> Vector2:
	# The wagon bed, in screen coordinates: a fraction of the frame
	# away from the sprite's centre, scaled with the puppy.
	return _puppy.position \
		+ (CART_OFFSET_FRAC * _puppy_frame_size) * _puppy_scale


# ----------------------------------------------------------------
#  Bubbles (with your toy PNGs inside)
# ----------------------------------------------------------------
func _make_toy_sprite(tex: Texture2D, max_size: float) -> Sprite2D:
	var spr := Sprite2D.new()
	spr.texture = tex
	spr.centered = true
	var ts := tex.get_size()
	spr.scale = Vector2.ONE * (max_size / maxf(ts.x, ts.y))
	return spr


func _spawn_bubble(initial_spread: bool = false) -> void:
	if _finished:
		return
	var s := _screen_size()
	var p := _progress()
	var radius := lerpf(RADIUS_START, RADIUS_END, p)
	var speed := lerpf(SPEED_START, SPEED_END, p) * randf_range(0.85, 1.15)

	var node := Node2D.new()
	var tex: Texture2D = TOY_TEXTURES[randi() % TOY_TEXTURES.size()]

	# The toy sits inside the bubble, sized to leave a little rim.
	node.add_child(_make_toy_sprite(tex, radius * 1.3))

	var film := Polygon2D.new()
	film.polygon = _circle_points(radius, 28)
	film.color = Color(0.75, 0.9, 1.0, 0.35)
	node.add_child(film)

	var rim := Line2D.new()
	rim.width = 3.0
	rim.default_color = Color(1.0, 1.0, 1.0, 0.8)
	rim.closed = true
	rim.points = _circle_points(radius, 28)
	node.add_child(rim)

	var shine := Polygon2D.new()
	shine.polygon = _circle_points(radius * 0.18, 12)
	shine.color = Color(1.0, 1.0, 1.0, 0.7)
	shine.position = Vector2(-radius * 0.4, -radius * 0.4)
	node.add_child(shine)

	var x := randf_range(radius + 20.0, s.x - radius - 20.0)
	var y := s.y + radius + 10.0
	if initial_spread:
		y = randf_range(s.y * 0.35, s.y + radius)
	node.position = Vector2(x, y)
	add_child(node)

	_bubbles.append({
		"node": node,
		"tex": tex,
		"radius": radius,
		"speed": speed,
		"sway_phase": randf() * TAU,
		"base_x": x,
	})


func _circle_points(r: float, steps: int = 20) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for k in steps:
		var ang := TAU * k / steps
		pts.append(Vector2(cos(ang), sin(ang)) * r)
	return pts


func _process(delta: float) -> void:
	if _finished:
		return
	_time += delta
	for b in _bubbles:
		var node: Node2D = b["node"]
		var speed: float = b["speed"]
		var radius: float = b["radius"]
		var phase: float = b["sway_phase"]
		var base_x: float = b["base_x"]
		node.position.y -= speed * delta
		node.position.x = base_x + sin(_time * 1.2 + phase) * 26.0
		# Off the top? Come back around from the bottom — never lost.
		if node.position.y < -radius - 20.0:
			node.position.y = _screen_size().y + radius + 10.0


# ----------------------------------------------------------------
#  Clicks
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

	for i in _bubbles.size():
		var b: Dictionary = _bubbles[i]
		var node: Node2D = b["node"]
		var radius: float = b["radius"]
		if mb.position.distance_to(node.position) <= radius:
			_pop_bubble(i)
			return
	# Misclicks do nothing at all.


func _pop_bubble(i: int) -> void:
	var b: Dictionary = _bubbles[i]
	var node: Node2D = b["node"]
	var tex: Texture2D = b["tex"]
	_bubbles.remove_at(i)
	_pops += 1

	_play_pop()
	_burst_droplets(node.position)

	# The bubble vanishes; the freed toy tumbles down to the cart.
	var toy := _make_toy_sprite(tex, 64.0)
	toy.position = node.position
	add_child(toy)
	node.queue_free()

	var slot := _pops % 5
	var target := _toy_drop_point() \
		+ Vector2(-24.0 + slot * 12.0, -6.0 - float(_pops / 5) * 12.0)
	var t := create_tween()
	t.tween_property(toy, "position", target, 0.7)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	t.parallel().tween_property(toy, "rotation", randf_range(-0.4, 0.4), 0.7)
	t.parallel().tween_property(toy, "scale", toy.scale * 0.7, 0.7)
	t.tween_callback(func () -> void:
		if is_instance_valid(toy):
			toy.reparent(_dropped_toys)
	)

	if _pops >= POPS_TO_WIN:
		_finish_level()
	else:
		# Keep the sky stocked with bubbles.
		_spawn_bubble()
		if _pops == 6:
			_say(VOICE_LOOK, "Look at all those toys! Keep popping!")


# ----------------------------------------------------------------
#  Finale: the puppy pulls the cart away, global star
# ----------------------------------------------------------------
func _finish_level() -> void:
	_finished = true
	_idle_timer.stop()
	_hide_ghost()
	for b in _bubbles:
		var node: Node2D = b["node"]
		if is_instance_valid(node):
			node.queue_free()
	_bubbles.clear()

	_say(VOICE_FREE, "All the toys are free! Off we go!")
	# Let the whole clip play before the puppy sets off.
	await _voice.finished
	await get_tree().create_timer(0.3).timeout

	# The walking animation already shows the toys riding in the
	# cart, so the collected pile fades away as the puppy sets off —
	# as if the toys were just packed in.
	var pack := create_tween()
	pack.tween_property(_dropped_toys, "modulate:a", 0.0, 0.5)
	pack.tween_callback(_dropped_toys.queue_free)
	_puppy_sprite.play(ANIM_WALK)
	_puppy_sprite.speed_scale = WALK_ANIM_SPEED
	var t := create_tween()
	t.tween_property(_puppy, "position:x", -PUPPY_HEIGHT * 2.0, WALK_OFF_SECONDS)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	await t.finished
	_puppy_sprite.speed_scale = 1.0

	StarChart.show_chart(StarChart.UNIT_1_LEVELS)
	await StarChart.add_star(LEVEL_NUMBER)
	level_completed.emit(LEVEL_NUMBER)
	get_tree().change_scene_to_file("res://Scenes/unit1-level8.tscn")


# ----------------------------------------------------------------
#  Pop effects
# ----------------------------------------------------------------
func _burst_droplets(pos: Vector2) -> void:
	var p := CPUParticles2D.new()
	p.one_shot = true
	p.emitting = true
	p.amount = 18
	p.lifetime = 0.5
	p.explosiveness = 1.0
	p.direction = Vector2(0, -1)
	p.spread = 180.0
	p.initial_velocity_min = 120.0
	p.initial_velocity_max = 260.0
	p.gravity = Vector2(0, 600)
	p.scale_amount_min = 2.0
	p.scale_amount_max = 4.0
	p.color = Color(0.75, 0.9, 1.0, 0.8)
	p.position = pos
	add_child(p)
	get_tree().create_timer(1.0).timeout.connect(p.queue_free)


func _play_pop() -> void:
	_play_tone(600.0, 1300.0, 0.08, 0.3)


# ----------------------------------------------------------------
#  Idle hint: ghost cursor glides to the nearest bubble + "clicks"
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
	if _finished or _bubbles.is_empty():
		return
	_say(VOICE_INTRO, _current_instruction)
	var mouse := get_viewport().get_mouse_position()
	var nearest: Node2D = _bubbles[0]["node"]
	var best := INF
	for b in _bubbles:
		var node: Node2D = b["node"]
		var d := mouse.distance_to(node.position)
		if d < best and node.position.y > 100.0:
			best = d
			nearest = node
	_ghost.visible = true
	_ghost.position = mouse
	var t := create_tween()
	t.tween_property(_ghost, "position", nearest.position, 1.2)\
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
