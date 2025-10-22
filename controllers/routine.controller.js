import { getWhatIsNext } from '../services/nextday.service.js';

export async function getCurrentRoutine(req, res) {
  try {
    const { userId, noHistory } = req.query || {};
    if (!userId) return res.status(400).json({ error: 'faltan parámetros' });

    const data = await getWhatIsNext(userId, { useHistory: !Boolean(noHistory) });
    if (!data.hasPlan) {
      return res.json({ hasPlan: false, message: 'No hay rutina registrada para este usuario.' });
    }

    let today = null;
    if (data.nextDay) {
      today = {
        name: data.nextDay.name,
        warmup: data.nextDay.warmup,
        exercises: (data.nextDay.exercises || []).map(e => ({
          name: e.name, sets: e.sets, reps: e.reps, rest_sec: e.rest_sec
        })),
        cooldown: data.nextDay.cooldown
      };
    }

    res.json({
      hasPlan: true,
      planCreatedAt: data.planCreatedAt,
      sessionsDone: data.sessionsDone,
      totalDays: data.totalDays,
      nextIndex: data.nextIndex,
      today,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
}
